# EDI Sandbox Environment

A local, developer-friendly sandbox for validating the AZUX 3PL WMS EDI integration engine
without requiring a paid commercial VAN contract.

## Supported Transaction Sets

| EDI  | Direction | Name                     | Ingestion Target        | Outbound Trigger              |
|------|-----------|--------------------------|-------------------------|-------------------------------|
| 832  | Inbound   | Price / Sales Catalog    | Item Master             | —                             |
| 940  | Inbound   | Warehouse Shipping Order | Outbound Orders         | —                             |
| 943  | Inbound   | Stock Transfer Shipment  | Inbound Shipments (ASN) | —                             |
| 944  | Outbound  | Stock Transfer Receipt   | —                       | Receipt confirmation          |
| 945  | Outbound  | Warehouse Shipping Advice| —                       | Pack/ship confirmation        |

## Directory Layout

```
sandbox/
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
│
├── edi-sandbox.ts          # Main entry point
├── edi-parser.ts           # X12 segment parser
├── edi-translator.ts       # EDI ↔ internal model mapping
├── file-watcher.ts         # Drop-zone file watcher
├── mock-api-client.ts      # WMS API client (mocks real endpoints)
├── response-generator.ts   # Outbound EDI 944/945 builder
├── ack-generator.ts        # 997 acknowledgment builder
│
├── test-data/
│   ├── 832-sample.edi
│   ├── 940-sample.edi
│   ├── 943-sample.edi
│   ├── 944-sample.edi
│   └── 945-sample.edi
│
├── inbound/                # Drop zone for incoming EDI files
├── outbound/               # Drop zone for outgoing EDI files
└── logs/                   # Processing logs
```

## Quick Start

```bash
# Install dependencies
cd sandbox && npm install

# Start the sandbox (watches inbound/ and outbound/ directories)
npm start

# Or run a single test file
npm run test:single -- --file test-data/940-sample.edi
```

## How It Works

1. Drop an EDI file into `sandbox/inbound/`
2. The file watcher detects it and triggers processing
3. The parser validates the X12 envelope and extracts transaction set data
4. The translator maps segments to internal WMS data models
5. The mock API client calls the WMS backend (Firestore) to create/update records
6. A 997 acknowledgment is generated to `sandbox/outbound/`
7. For outbound transactions (944/945), the response generator produces the EDI file

## Configuration

See `.env.example` for configuration options.