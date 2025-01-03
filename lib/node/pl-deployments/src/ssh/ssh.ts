import type { ConnectConfig, ClientChannel } from 'ssh2';
import { Client, Connection } from 'ssh2';
import net from 'net';

/** Promisified exec on ssh connection. */
export function sshExec(client: Client, command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err: any, stream: ClientChannel) => {
      if (err) return reject(err);

      let stdout = '';
      let stderr = '';

      stream.on('close', (code: number) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      }).on('data', (data: ArrayBuffer) => {
        stdout += data.toString();
      }).stderr.on('data', (data: ArrayBuffer) => {
        stderr += data.toString();
      });
    });
  });
}

/**
 * Promisified connect function for ssh Client.
 */
export function sshConnect(client: Client, config: ConnectConfig): Promise<undefined> {
  return new Promise((resolve, reject) => {
    client.on('ready', () => {
      resolve(undefined);
    }).on('error', (err: any) => {
      reject(err);
    }).on('timeout', () => {
      reject(new Error(`timeout was occurred while waiting for SSH connection.`));
    }).connect(config);
  });
}
/**
 * Get auth types for host
 * @param host - remote host
 * @returns string[] //['publickey', 'password']
 */
export async function sshGetAuthTypes(host: string) {
  return new Promise((resolve) => {
    let stdout = '';
    sshConnect(new Client(), {
      host,
      username: new Date().getTime().toString(),
      debug: (err: string) => {
        stdout += `${err} \n`;
      },
    })
      .catch((err) => err)
      .finally(() => {
        const types = extractAuthMethods(stdout);
        resolve(types.length === 0 ? ['publickey', 'password'] : types);
      });
  });
}

function extractAuthMethods(log: string): string[] {
  const newFormatMatch = log.match(/Inbound: Received USERAUTH_FAILURE \((.+)\)/);
  if (newFormatMatch && newFormatMatch[1]) {
    return newFormatMatch[1].split(',').map((method) => method.trim());
  }
  return [];
}

export function forwardMultiplePorts(config: ConnectConfig, ports: { remotePort: number; localPort: number; localHost?: string }) {
  const conn = new Client();
  conn.on('ready', () => {
    console.log(`[SSH] Подключено к ${config.host}. Открываем локальный сервер на порт ${ports.localPort}.`);
    console.log(`[SSH] Трафик будет перенаправлен на :${ports.remotePort}`);
    // Создаём локальный TCP-сервер, слушающий localhost:localPort
    net.createServer((localSocket) => {
      console.log('localSocket');
      // При каждом новом входящем соединении открываем канал forwardOut
      conn.forwardOut(
        // Эмулируем, что "источник" — это 127.0.0.1:0
        '127.0.0.1',
        0,
        'localhost', // remoteHost,
        ports.remotePort,
        (err, stream) => {
          if (err) {
            console.error('Ошибка при открытии SSH-канала:', err.message);
            localSocket.end();
            return;
          }
          // Перенаправляем все данные socket <-> stream
          localSocket.pipe(stream);
          stream.pipe(localSocket);
        },
      );
    }).listen(ports.localPort, '127.0.0.1', () => {
      console.log(`[+] Порт ${ports.localPort} доступен локально → :${ports.remotePort}`);
      console.log('Откройте свой gRPC (или другой) клиент на localhost:' + ports.localPort);
    });
  });

  conn.on('error', (err) => {
    console.error('[SSH] Ошибка при SSH-подключении:', err.message);
  });

  conn.on('close', () => {
    console.log('[SSH] Подключение закрыто');
  });

  // Инициируем SSH-подключение
  conn.connect({ ...config, debug(err: string) {
    console.log(err);
  } });
}
// export function forwardMultiplePorts(config: ConnectConfig, ports: { remotePort: number; localPort: number; localHost?: string }) {
//   const conn = new Client();

//   conn.on('ready', () => {
//     console.log(`[SSH] Подключено к ${config.host}. Открываем локальный сервер на порт ${ports.localPort}.`);
//     console.log(`[SSH] Трафик будет перенаправлен на :${ports.remotePort}`);

//     // Создаём локальный TCP-сервер, слушающий localhost:localPort
//     net.createServer((localSocket) => {
//       localSocket.setKeepAlive(true, 60000);
//       // При каждом новом входящем соединении открываем канал forwardOut
//       conn.forwardOut(
//         // Эмулируем, что "источник" — это 127.0.0.1:0
//         '127.0.0.1',
//         0,
//         'localhost', // remoteHost,
//         ports.remotePort,
//         (err, stream) => {
//           if (err) {
//             console.error('Ошибка при открытии SSH-канала:', err.message);
//             localSocket.end();
//             return;
//           }
//           // Перенаправляем все данные socket <-> stream
//           localSocket.pipe(stream);
//           stream.pipe(localSocket);
//         },
//       );
//     }).listen(ports.localPort, '127.0.0.1', () => {
//       console.log(`[+] Порт ${ports.localPort} доступен локально → :${ports.remotePort}`);
//       console.log('Откройте свой gRPC (или другой) клиент на localhost:' + ports.localPort);
//     });
//   });

//   conn.on('error', (err) => {
//     console.error('[SSH] Ошибка при SSH-подключении:', err.message);
//   });

//   conn.on('close', () => {
//     console.log('[SSH] Подключение закрыто');
//   });

//   // Инициируем SSH-подключение
//   conn.connect({ ...config, debug(err: string) {
//     console.log(err);
//   } });
// }
