import { DEFAULT_RO_TX_TIMEOUT, DEFAULT_RW_TX_TIMEOUT, plAddressToConfig } from './config';

test('config form url no auth', () => {
  const conf = plAddressToConfig('http://127.0.0.1:6345');
  expect(conf.user).toBeUndefined();
  expect(conf.password).toBeUndefined();
});

test('config form url with auth', () => {
  const conf = plAddressToConfig('http://user1:password2@127.0.0.1:6345');
  expect(conf.user).toEqual('user1');
  expect(conf.password).toEqual('password2');
});

test('config form url with auth and special symbols', () => {
  const conf = plAddressToConfig('http://user1:password232$@127.0.0.1:6345');
  expect(conf.user).toEqual('user1');
  expect(conf.password).toEqual('password232$');
  expect(conf.defaultROTransactionTimeout).toEqual(DEFAULT_RO_TX_TIMEOUT);
  expect(conf.defaultRWTransactionTimeout).toEqual(DEFAULT_RW_TX_TIMEOUT);
});

test('config form url with auth and special symbols and tx timeout', () => {
  const conf = plAddressToConfig('http://user1:password232$@127.0.0.1:6345/?tx-timeout=11341');
  expect(conf.user).toEqual('user1');
  expect(conf.password).toEqual('password232$');
  expect(conf.defaultROTransactionTimeout).toEqual(11341);
  expect(conf.defaultRWTransactionTimeout).toEqual(11341);
});

test('config form url with auth and special symbols and ro tx timeout', () => {
  const conf = plAddressToConfig('http://user1:password232$@127.0.0.1:6345/?ro-tx-timeout=11341');
  expect(conf.user).toEqual('user1');
  expect(conf.password).toEqual('password232$');
  expect(conf.defaultROTransactionTimeout).toEqual(11341);
  expect(conf.defaultRWTransactionTimeout).toEqual(DEFAULT_RW_TX_TIMEOUT);
});
