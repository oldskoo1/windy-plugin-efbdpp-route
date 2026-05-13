export interface Waypoint {
    routeId: string;
    rowIndex: number;
    sequence: string;
    name: string;
    latRaw: string;
    lonRaw: string;
    lat: number;
    lon: number;
}

export interface FlightPlanRoute {
    flightId: string;
    flightDate: string;
    routeId: string;
    waypoints: Waypoint[];
}

interface SchemaEntry {
    rootPage: number;
    columns: string[];
}

type SqlValue = string | number | null;

const textDecoder = new TextDecoder();

const readU16 = (view: DataView, offset: number) => view.getUint16(offset, false);
const readU32 = (view: DataView, offset: number) => view.getUint32(offset, false);

const readVarint = (view: DataView, offset: number) => {
    let value = 0;
    let next = offset;

    for (let index = 0; index < 9; index += 1) {
        const byte = view.getUint8(next);
        next += 1;

        if (index === 8) {
            value = value * 256 + byte;
            break;
        }

        value = value * 128 + (byte & 0x7f);

        if ((byte & 0x80) === 0) {
            break;
        }
    }

    return { value, next };
};

const pageOffset = (pageNumber: number, pageSize: number) => (pageNumber - 1) * pageSize;

const readSignedInt = (view: DataView, offset: number, length: number) => {
    let value = 0;

    for (let index = 0; index < length; index += 1) {
        value = value * 256 + view.getUint8(offset + index);
    }

    const signBit = 2 ** (length * 8 - 1);
    return value >= signBit ? value - 2 ** (length * 8) : value;
};

const readRecord = (view: DataView, payloadOffset: number) => {
    const header = readVarint(view, payloadOffset);
    const headerEnd = payloadOffset + header.value;
    const serialTypes: number[] = [];
    let serialOffset = header.next;

    while (serialOffset < headerEnd) {
        const serial = readVarint(view, serialOffset);
        serialTypes.push(serial.value);
        serialOffset = serial.next;
    }

    let valueOffset = headerEnd;

    return serialTypes.map(serialType => {
        if (serialType === 0) {
            return null;
        }

        if (serialType >= 1 && serialType <= 6) {
            const length = [0, 1, 2, 3, 4, 6, 8][serialType];
            const value = readSignedInt(view, valueOffset, length);
            valueOffset += length;
            return value;
        }

        if (serialType === 7) {
            const value = view.getFloat64(valueOffset, false);
            valueOffset += 8;
            return value;
        }

        if (serialType === 8 || serialType === 9) {
            return serialType - 8;
        }

        const length = Math.floor((serialType - 12) / 2);
        const bytes = new Uint8Array(view.buffer, view.byteOffset + valueOffset, length);
        valueOffset += length;

        return serialType % 2 === 1 ? textDecoder.decode(bytes) : null;
    }) as SqlValue[];
};

const readTableRows = (view: DataView, pageSize: number, rootPage: number): SqlValue[][] => {
    const rows: SqlValue[][] = [];

    const visitPage = (pageNumber: number) => {
        const start = pageOffset(pageNumber, pageSize);
        const headerOffset = start + (pageNumber === 1 ? 100 : 0);
        const pageType = view.getUint8(headerOffset);
        const cellCount = readU16(view, headerOffset + 3);
        const pointerOffset = headerOffset + (pageType === 0x05 ? 12 : 8);

        if (pageType === 0x05) {
            for (let index = 0; index < cellCount; index += 1) {
                const cellOffset = start + readU16(view, pointerOffset + index * 2);
                visitPage(readU32(view, cellOffset));
            }

            visitPage(readU32(view, headerOffset + 8));
            return;
        }

        if (pageType !== 0x0d) {
            throw new Error('Unsupported SQLite page type.');
        }

        for (let index = 0; index < cellCount; index += 1) {
            const cellOffset = start + readU16(view, pointerOffset + index * 2);
            const payloadSize = readVarint(view, cellOffset);
            const rowId = readVarint(view, payloadSize.next);
            rows.push(readRecord(view, rowId.next));
        }
    };

    visitPage(rootPage);
    return rows;
};

const parseColumns = (sql: string) => {
    const start = sql.indexOf('(');
    const end = sql.lastIndexOf(')');

    if (start === -1 || end === -1 || end <= start) {
        return [];
    }

    return sql
        .slice(start + 1, end)
        .split(',')
        .map(part => part.trim().split(/\s+/)[0])
        .filter(Boolean);
};

const readSchema = (view: DataView, pageSize: number) => {
    const entries = new Map<string, SchemaEntry>();

    for (const row of readTableRows(view, pageSize, 1)) {
        const type = String(row[0] ?? '');
        const name = String(row[1] ?? '');
        const rootPage = Number(row[3] ?? 0);
        const sql = String(row[4] ?? '');

        if (type === 'table' && rootPage > 0) {
            entries.set(name, { rootPage, columns: parseColumns(sql) });
        }
    }

    return entries;
};

const tableObjects = (rows: SqlValue[][], columns: string[]) =>
    rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])));

const coordToDecimal = (value: string): number => {
    const trimmed = value.trim();
    const match = /^([NSEW])\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/i.exec(trimmed);

    if (!match) {
        throw new Error(`Invalid coordinate: ${value}`);
    }

    const hemisphere = match[1].toUpperCase();
    const degrees = Number(match[2]);
    const minutes = Number(match[3]);
    const decimal = degrees + minutes / 60;

    return hemisphere === 'S' || hemisphere === 'W' ? -decimal : decimal;
};

export const parseEfbdpp = async (buffer: ArrayBuffer): Promise<FlightPlanRoute> => {
    const view = new DataView(buffer);
    const signature = textDecoder.decode(new Uint8Array(buffer, 0, 16));

    if (!signature.startsWith('SQLite format 3')) {
        throw new Error('This file is not a valid efbDPP SQLite file.');
    }

    const pageSize = readU16(view, 16);
    const schema = readSchema(view, pageSize);
    const planSchema = schema.get('DigitalFlightPlan');

    if (!planSchema) {
        throw new Error('DigitalFlightPlan table was not found.');
    }

    const infoSchema = schema.get('DigitalFlightPlanInfo');
    const info = infoSchema
        ? tableObjects(readTableRows(view, pageSize, infoSchema.rootPage), infoSchema.columns)[0] ?? {}
        : {};
    const planRows = tableObjects(readTableRows(view, pageSize, planSchema.rootPage), planSchema.columns);
    const routeIds = Array.from(new Set(planRows.map(row => String(row.Company_EnRoute_ID ?? '').trim()).filter(Boolean)))
        .sort((left, right) => Number(left) - Number(right));
    const firstRouteId = routeIds[0];

    if (!firstRouteId) {
        throw new Error('No route segment was found in DigitalFlightPlan.');
    }

    const waypoints = planRows
        .filter(row => String(row.Company_EnRoute_ID ?? '').trim() === firstRouteId)
        .sort((left, right) => Number(left.RowIndex ?? 0) - Number(right.RowIndex ?? 0))
        .map(row => {
            const latRaw = String(row.Lat ?? '').trim();
            const lonRaw = String(row.Long ?? '').trim();

            return {
                routeId: firstRouteId,
                rowIndex: Number(row.RowIndex ?? 0),
                sequence: String(row.Sequnce ?? '').trim(),
                name: String(row.Position ?? '').trim(),
                latRaw,
                lonRaw,
                lat: coordToDecimal(latRaw),
                lon: coordToDecimal(lonRaw),
            };
        });

    if (waypoints.length === 0) {
        throw new Error('No waypoints were found in the first route segment.');
    }

    return {
        flightId: String(info.FlightID ?? ''),
        flightDate: String(info.FlightDate ?? ''),
        routeId: firstRouteId,
        waypoints,
    };
};
