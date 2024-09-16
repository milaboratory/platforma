import { plAddressToConfig } from './config';

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
});
