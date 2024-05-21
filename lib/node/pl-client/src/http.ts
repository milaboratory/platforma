import * as util from 'util';
import http from 'node:http';
import https from 'node:https';
import { Readable, finished } from 'stream';

type RequestOptions = https.RequestOptions;

export const finishedP = util.promisify(finished);

export const readableToBuffer = (
  stream: http.IncomingMessage
): Promise<Buffer> => {
  if (stream.destroyed) {
    return Promise.reject(stream.errored);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
};

class Body {
  private buff: Buffer | undefined;

  public constructor(private message: http.IncomingMessage) {}

  async redable() {
    return this.buffer().then(b => Readable.from(b));
  }

  async buffer(): Promise<Buffer> {
    if (!this.buff) {
      this.buff = await readableToBuffer(this.message).catch(e => {
        throw e;
      });
    }

    return this.buff;
  }

  async string() {
    return this.buffer().then(b => b.toString());
  }

  async json() {
    return this.string().then(s => JSON.parse(s));
  }
}

export class HttpClient {
  constructor(private options: RequestOptions) {
  }

  assingOptions(options: RequestOptions) {
    Object.assign(this.options, options);
  }

  request(
    url: URL | string,
    conf: {
      data?: Buffer | string;
    } & RequestOptions
  ) {
    url = typeof url === 'string' ? new URL(url) : url;

    const data = conf.data ?? Buffer.from('');
    
    delete conf.data;
    
    const options: RequestOptions = Object.assign(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: url.port,
      } as RequestOptions,
      this.options,
      conf,
    );

    if (!options.method) {
      options.method = 'GET';
    }
    
    if (!options.headers) {
      options.headers = {};
    }
    
    options.headers['Content-Length'] = Buffer.byteLength(data);

    // console.log('options', JSON.stringify(options, null, 2));
    
    const isTls = url.protocol === 'https:';
    
    const lib = isTls ? https : http;
    
    return new Promise<{
      statusCode: number;
      ok: boolean;
      headers: http.IncomingHttpHeaders;
      body: Body;
    }>((resolve, reject) => {
      const timeout = options.timeout ?? 30000;

      const t = setTimeout(() => {
        req.end();
        reject(Error(`Timeout ${timeout} exceeded`));
      }, timeout);

      resolve = wrapFunction(resolve, () => clearTimeout(t)); // @TODO PromiseTimeout in utils
      reject = wrapFunction(reject, () => clearTimeout(t));

      const req = lib.request(options, message => {
        const statusCode = message.statusCode ?? 500;
        resolve({
          statusCode,
          headers: message.headers,
          ok: statusCode >= 200 && statusCode < 300,
          body: new Body(message),
        });
      });

      req.on('connect', (message, socket) => {
        const statusCode = message.statusCode ?? 500;
        socket.end();
        socket.on('error', () => {});
        resolve({
          statusCode,
          ok: statusCode >= 200 && statusCode < 300,
          headers: message.headers,
          body: new Body(message),
        });
      });
      
      req.on('error', e => {
        reject(e);
      });
      
      if (data.length) {
        req.write(data);
      }

      req.end();
    });
  }

  async connectProxy(proxy: URL | string) {
    proxy = new URL(proxy);

    const headers = {} as http.OutgoingHttpHeaders;

    if (proxy.username && proxy.password) {
      headers['Proxy-Authorization'] = `Basic ${Buffer.from(proxy.username + ':' + proxy.password).toString('base64')}`;
    }

    return this.request(proxy, {
      method: 'CONNECT',
      path: 'www.google.com:80', // @TODO temp (it seems that we need a target in order to get 200 from the proxy)
      headers,
      agent: undefined
    }).then(r => ({ok: r.ok, statusCode: r.statusCode})).catch(() => ({ok: false, statusCode: 500}));
  }
}

export const wrapFunction = <T extends unknown[], U>(
  fn: (...args: T) => U,
  before: () => void
) => {
  return (...args: T): U => {
    before();
    return fn(...args);
  };
};

