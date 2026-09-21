import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helperTokenFromFragment, makeImportPayload } from './mac-helper.ts';
test('only a native helper session token is accepted from a URL fragment', () => {
  const token = '11111111-1111-4111-8111-11111111111122222222-2222-4222-8222-222222222222';
  assert.equal(helperTokenFromFragment(`#mac-helper=${token}`), token);
  assert.equal(helperTokenFromFragment('#mac-helper=attacker'), null);
  assert.equal(helperTokenFromFragment('#other=value'), null);
});
test('bridge payload uses structured base64 and a stable request id for retries', () => {
  const payload = makeImportPayload('request-1', '水印助手测试', { jpg: new Uint8Array([255,216,0]), mov: new Uint8Array([1,2,3]) });
  assert.equal(payload.requestId, 'request-1');
  assert.equal(payload.name, '水印助手测试');
  assert.deepEqual(Buffer.from(payload.jpg, 'base64'), Buffer.from([255,216,0]));
  assert.deepEqual(Buffer.from(payload.mov, 'base64'), Buffer.from([1,2,3]));
});
