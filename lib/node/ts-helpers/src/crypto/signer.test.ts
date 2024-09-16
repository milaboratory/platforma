import { HmacSha256Signer } from './signer';

test('signer test', () => {
  const secret1 = HmacSha256Signer.generateSecret();
  const signer1 = new HmacSha256Signer(secret1);

  const secret2 = HmacSha256Signer.generateSecret();
  const signer2 = new HmacSha256Signer(secret2);

  const data1 = 'data1';
  const data2 = 'data2';

  const signature11 = signer1.sign(data1);
  const signature12 = signer1.sign(data2);
  const signature21 = signer2.sign(data1);
  const signature22 = signer2.sign(data2);

  signer1.verify(data1, signature11);
  signer1.verify(data2, signature12);
  signer2.verify(data1, signature21);
  signer2.verify(data2, signature22);

  expect(() => signer1.verify(data1, signature12)).toThrow('verification');
  expect(() => signer1.verify(data2, signature11)).toThrow('verification');
  expect(() => signer2.verify(data1, signature22)).toThrow('verification');
  expect(() => signer2.verify(data2, signature21)).toThrow('verification');

  expect(() => signer1.verify(data1, signature21)).toThrow('verification');
  expect(() => signer1.verify(data2, signature22)).toThrow('verification');
  expect(() => signer2.verify(data1, signature11)).toThrow('verification');
  expect(() => signer2.verify(data2, signature12)).toThrow('verification');
});
