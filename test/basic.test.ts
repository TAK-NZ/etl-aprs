import test from 'node:test';
import assert from 'node:assert';
import { SchemaType, DataFlowType, StaticCapabilities } from '@tak-ps/etl';

// task.ts calls Task.init() at module scope which requires an ETL environment,
// so these must be set before the dynamic import below
process.env.ETL_API = process.env.ETL_API || 'http://localhost:5001';
process.env.ETL_LAYER = process.env.ETL_LAYER || '1';
process.env.ETL_TOKEN = process.env.ETL_TOKEN || 'etl.test-token';

const { default: Task } = await import('../task.js');

test('Task static config', () => {
    assert.equal(Task.name, 'etl-aprs');
    assert.deepEqual(Task.flow, [DataFlowType.Incoming]);
});

test('Incoming Input schema', async () => {
    const task = await Task.init();
    const schema = await task.schema(SchemaType.Input, DataFlowType.Incoming);

    assert.equal(schema.type, 'object');
    for (const key of [
        'APRS_HOST',
        'APRS_PORT',
        'CALLSIGN',
        'PASSCODE',
        'FILTER',
        'COT_TYPE',
        'IGNORE_SOURCES',
        'RESEND_INTERVAL',
        'DEBUG'
    ]) {
        assert.ok(schema.properties[key], `Env schema missing property: ${key}`);
    }

    assert.equal(schema.properties.APRS_HOST.type, 'string');
    assert.equal(schema.properties.APRS_HOST.default, 'rotate.aprs.net');
    assert.equal(schema.properties.APRS_PORT.type, 'number');
    assert.equal(schema.properties.APRS_PORT.default, 14580);
    assert.equal(schema.properties.CALLSIGN.default, 'NOCALL');
    assert.equal(schema.properties.PASSCODE.type, 'string');
    assert.equal(schema.properties.PASSCODE.default, '-1');
    assert.equal(schema.properties.IGNORE_SOURCES.type, 'array');
    assert.deepEqual(schema.properties.IGNORE_SOURCES.default, []);
    assert.equal(schema.properties.RESEND_INTERVAL.type, 'number');
    assert.equal(schema.properties.RESEND_INTERVAL.default, 20);
    assert.equal(schema.properties.DEBUG.type, 'boolean');
    assert.equal(schema.properties.DEBUG.default, false);
});

test('Incoming Output schema', async () => {
    const task = await Task.init();
    const schema = await task.schema(SchemaType.Output, DataFlowType.Incoming);

    assert.equal(schema.type, 'object');
    for (const key of [
        'from',
        'destination',
        'latitude',
        'longitude',
        'comment',
        'symbol',
        'symbol_table',
        'course',
        'speed',
        'altitude',
        'timestamp',
        'raw'
    ]) {
        assert.ok(schema.properties[key], `Output schema missing property: ${key}`);
    }
    assert.deepEqual(schema.required, ['from', 'latitude', 'longitude']);
});

test('Outgoing flow is not provided', async () => {
    const task = await Task.init();
    const schema = await task.schema(SchemaType.Input, DataFlowType.Outgoing);

    assert.deepEqual(schema.properties, {});
});

test('capabilities.json is a valid manifest', async () => {
    const doc = await StaticCapabilities.read('./capabilities.json');

    assert.ok(doc);
    // The task holds the APRS-IS socket open for 300s per run
    assert.ok(doc.compute.timeout > 300, 'compute.timeout must exceed the 5 minute collection window');
});
