# ETL-APRS

ETL (Extract, Transform, Load) service for integrating APRS (Automatic Packet Reporting System) data into TAK (Team Awareness Kit) systems.

## Overview

This ETL connects to APRS-IS (APRS Internet Service) servers to receive real-time amateur radio position reports and transforms them into Cursor-on-Target (CoT) format for display in TAK applications.

## Features

- Connects to APRS-IS servers for real-time data
- Parses APRS position reports
- Transforms APRS data to TAK-compatible CoT format
- Configurable filters and parameters
- Support for callsign-based filtering
- Debug logging capabilities

## Configuration

| Parameter | Description | Default |
|-----------|-------------|----------|
| `APRS_HOST` | APRS-IS server hostname | `rotate.aprs.net` |
| `APRS_PORT` | APRS-IS server port | `14580` |
| `CALLSIGN` | Your amateur radio callsign | `NOCALL` |
| `PASSCODE` | APRS-IS passcode (-1 for read-only) | `-1` |
| `FILTER` | APRS-IS filter (e.g., m/50 for 50km radius) | `m/50` |
| `COT_TYPE` | Default CoT type for APRS stations | `a-f-G-I-U-T-r` |
| `COT_STALE` | CoT stale time in seconds | `3600` |
| `DEBUG` | Enable debug logging | `false` |

## APRS Filters

Common APRS-IS filter examples:
- `m/50` - All packets within 50km of your location
- `r/lat/lon/dist` - Packets within distance of lat/lon
- `p/AA/BB/CC` - Only packets from specific prefixes
- `b/call1/call2` - Only packets from specific callsigns

## Development

```bash
npm install
npm run build
npm run lint
```

## License

MIT License - see LICENSE file for details.
