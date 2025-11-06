import { DEFAULT_RO_TX_TIMEOUT, DEFAULT_RW_TX_TIMEOUT, plAddressToConfig } from './config';
import { test, expect } from 'vitest';

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

test('should correctly handle http URL with no explicit port, defaulting to 80', () => {
  const config = plAddressToConfig('http://example.com');
  expect(config.hostAndPort).toBe('example.com:80');
  expect(config.ssl).toBe(false);
});

test('should correctly handle http URL with explicit port 80', () => {
  const config = plAddressToConfig('http://example.com:80');
  expect(config.hostAndPort).toBe('example.com:80');
  expect(config.ssl).toBe(false);
});

test('should correctly handle https URL with no explicit port, defaulting to 443', () => {
  const config = plAddressToConfig('https://example.com');
  expect(config.hostAndPort).toBe('example.com:443');
  expect(config.ssl).toBe(true);
});

test('should correctly handle https URL with explicit port 443', () => {
  const config = plAddressToConfig('https://example.com:443');
  expect(config.hostAndPort).toBe('example.com:443');
  expect(config.ssl).toBe(true);
});

test('should retain non-default port for http URL', () => {
  const config = plAddressToConfig('http://example.com:8080');
  expect(config.hostAndPort).toBe('example.com:8080');
  expect(config.ssl).toBe(false);
});

test('should retain non-default port for https URL', () => {
  const config = plAddressToConfig('https://example.com:8443');
  expect(config.hostAndPort).toBe('example.com:8443');
  expect(config.ssl).toBe(true);
});

test('should throw an error for grpc URL without an explicit port', () => {
  expect(() => plAddressToConfig('grpc://example.com')).toThrow(
    'Port must be specified explicitly for grpc: protocol.',
  );
});

test('should throw an error for tls URL without an explicit port', () => {
  expect(() => plAddressToConfig('tls://example.com')).toThrow(
    'Port must be specified explicitly for tls: protocol.',
  );
});
