import { Static, Type, TSchema } from '@sinclair/typebox';
import ETL, { Event, SchemaType, handler as internal, local, InvocationType, DataFlowType, InputFeatureCollection } from '@tak-ps/etl';
import * as net from 'net';

const Env = Type.Object({
    'APRS_HOST': Type.String({
        description: 'APRS-IS server hostname',
        default: 'rotate.aprs.net'
    }),
    'APRS_PORT': Type.Number({
        description: 'APRS-IS server port',
        default: 14580
    }),
    'CALLSIGN': Type.String({
        description: 'Callsign for APRS-IS login (any valid format works for read-only)',
        default: 'NOCALL'
    }),
    'PASSCODE': Type.String({
        description: 'APRS-IS passcode (-1 for read-only access, no license required)',
        default: '-1'
    }),
    'FILTER': Type.String({
        description: 'APRS-IS filter: r/-41.29/174.78/50 (50km radius from coords), p/ZL/VK (prefixes), b/call1/call2 (specific calls)',
        default: 'r/-41.29/174.78/50'
    }),
    'COT_TYPE': Type.String({
        description: 'Default CoT type for APRS stations',
        default: 'a-f-G-I-U-T-r'
    }),

    'IGNORE_SOURCES': Type.Array(Type.String(), {
        description: 'List of APRS sources to ignore (e.g., APHPIB for earthquake messages)',
        default: []
    }),
    'RESEND_INTERVAL': Type.Number({
        description: 'Interval in seconds to resend all stored APRS stations to TAK',
        default: 20
    }),
    'DEBUG': Type.Boolean({
        description: 'Enable debug logging',
        default: false
    })
});

const APRSFrame = Type.Object({
    from: Type.String(),
    latitude: Type.Number(),
    longitude: Type.Number(),
    comment: Type.Optional(Type.String()),
    symbol: Type.Optional(Type.String()),
    symbol_table: Type.Optional(Type.String()),
    course: Type.Optional(Type.Number()),
    speed: Type.Optional(Type.Number()),
    altitude: Type.Optional(Type.Number()),
    timestamp: Type.Optional(Type.Number()),
    raw: Type.Optional(Type.String())
});

export default class Task extends ETL {
    static name = 'etl-aprs';
    static flow = [DataFlowType.Incoming];
    static invocation = [InvocationType.Schedule];
    
    private stationCache = new Map<string, Static<typeof APRSFrame> & { lastSeen: Date }>();

    async schema(
        type: SchemaType = SchemaType.Input,
        flow: DataFlowType = DataFlowType.Incoming
    ): Promise<TSchema> {
        if (flow === DataFlowType.Incoming) {
            if (type === SchemaType.Input) {
                return Env;
            } else {
                return APRSFrame;
            }
        } else {
            return Type.Object({});
        }
    }

    private parseAPRSFrame(data: string): Static<typeof APRSFrame> | null {
        try {
            // Basic APRS frame parsing - simplified version
            const parts = data.split(':');
            if (parts.length < 2) return null;

            const header = parts[0];
            const payload = parts.slice(1).join(':');

            // Extract callsign from header (before '>')
            const callsignMatch = header.match(/^([A-Z0-9-]+)/);
            if (!callsignMatch) return null;
            const from = callsignMatch[1];

            // Look for position data in payload
            // Format: !DDMM.mmN/DDDMM.mmW or =DDMM.mmN/DDDMM.mmW
            const posMatch = payload.match(/[!=](\d{4}\.\d{2})([NS])[\\/](\d{5}\.\d{2})([EW])/);
            if (!posMatch) return null;

            // Convert APRS coordinates to decimal degrees
            const latDeg = parseInt(posMatch[1].substring(0, 2));
            const latMin = parseFloat(posMatch[1].substring(2));
            let latitude = latDeg + latMin / 60;
            if (posMatch[2] === 'S') latitude = -latitude;

            const lonDeg = parseInt(posMatch[3].substring(0, 3));
            const lonMin = parseFloat(posMatch[3].substring(3));
            let longitude = lonDeg + lonMin / 60;
            if (posMatch[4] === 'W') longitude = -longitude;

            // Extract comment (everything after position)
            const commentMatch = payload.match(/[!=]\d{4}\.\d{2}[NS][\\/]\d{5}\.\d{2}[EW](.*)$/);
            const comment = commentMatch ? commentMatch[1].trim() : '';

            return {
                from,
                latitude,
                longitude,
                comment: comment || undefined,
                raw: data
            };
        } catch (error) {
            console.warn(`Failed to parse APRS frame: ${data}`, error);
            return null;
        }
    }

    private async connectToAPRS(env: Static<typeof Env>): Promise<string[]> {
        return new Promise((resolve, reject) => {

            const frames: string[] = [];
            
            const socket = net.createConnection(env.APRS_PORT, env.APRS_HOST);
            
            socket.setTimeout(30000); // 30 second timeout
            
            socket.on('connect', () => {
                if (env.DEBUG) {
                    console.log(`Connected to APRS-IS: ${env.APRS_HOST}:${env.APRS_PORT}`);
                }
                
                // Send login string
                let login = `user ${env.CALLSIGN} pass ${env.PASSCODE} vers etl-aprs 1.0.0`;
                if (env.FILTER) {
                    login += ` filter ${env.FILTER}`;
                }
                login += '\r\n';
                
                socket.write(login);
                
                // Collect data for 5 minutes to catch more stations
                setTimeout(() => {
                    socket.end();
                    resolve(frames);
                }, 300000);
            });
            
            socket.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        frames.push(trimmed);
                        if (env.DEBUG) {
                            console.log(`APRS frame: ${trimmed}`);
                        }
                    }
                }
            });
            
            socket.on('error', (err: Error) => {
                console.error(`APRS connection error: ${err.message}`);
                reject(err);
            });
            
            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('APRS connection timeout'));
            });
        });
    }

    async control() {
        const env = await this.env(Env);
        
        try {
            console.log(`Connecting to APRS-IS: ${env.APRS_HOST}:${env.APRS_PORT}`);
            
            // Get APRS frames
            const frames = await this.connectToAPRS(env);
            
            // Process new frames and update cache
            for (const frameData of frames) {
                if (frameData.startsWith('#')) continue;
                
                const frame = this.parseAPRSFrame(frameData);
                if (!frame) continue;
                
                if (env.IGNORE_SOURCES.includes(frame.from)) continue;
                
                this.stationCache.set(frame.from, { ...frame, lastSeen: new Date() });
            }
            
            // Clean old entries (older than 1 hour)
            const oneHourAgo = new Date(Date.now() - 3600000);
            for (const [callsign, station] of this.stationCache.entries()) {
                if (station.lastSeen < oneHourAgo) {
                    this.stationCache.delete(callsign);
                }
            }
            
            // Create features from all cached stations
            const features: Static<typeof InputFeatureCollection>['features'] = [];
            for (const [, station] of this.stationCache.entries()) {
                const callsign = station.from.replace(' ', '');
                const uid = `APRS.${callsign}`;
                
                const remarks = [
                    `Callsign: ${callsign}`,
                    station.comment ? `Comment: ${station.comment}` : null,
                    `Last Seen: ${station.lastSeen.toISOString()}`,
                    station.raw ? `Raw: ${station.raw}` : null
                ].filter(Boolean).join('\n');
                
                features.push({
                    id: uid,
                    type: 'Feature',
                    properties: {
                        type: env.COT_TYPE,
                        callsign: `${callsign} (APRS)`,
                        time: station.lastSeen.toISOString(),
                        start: station.lastSeen.toISOString(),
                        course: station.course || 0,
                        speed: station.speed ? station.speed * 0.514444 : 0,
                        icon: 'ad78aafb-83a6-4c07-b2b9-a897a8b6a38f:Shapes/triangle',
                        remarks,
                        metadata: station
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [
                            station.longitude,
                            station.latitude,
                            station.altitude || 0
                        ]
                    }
                });
            }
            
            const fc: Static<typeof InputFeatureCollection> = {
                type: 'FeatureCollection',
                features
            };
            
            console.log(`Processed ${frames.length} new frames, sending ${features.length} cached stations to TAK`);
            await this.submit(fc);
            
        } catch (error) {
            console.error(`APRS ETL error: ${error instanceof Error ? error.message : String(error)}`);
            await this.submit({
                type: 'FeatureCollection',
                features: []
            });
        }
    }
}

await local(new Task(import.meta.url), import.meta.url);

export async function handler(event: Event = {}) {
    return await internal(new Task(import.meta.url), event);
}