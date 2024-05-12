// export interface PingResponse {
//   coreVersion: string;
//   coreFullVersion: string;
//   serverInfo: {
//     MinimalUIVersion?: string
//   };
// }
//
// export function parsePingResponse(string: string): PingResponse {
//   const parsingResult = JSON.parse(string);
//   if (parsingResult.serverInfo !== undefined && typeof parsingResult.serverInfo === 'string')
//     parsingResult.serverInfo = JSON.parse(parsingResult.serverInfo);
//   return parsingResult as PingResponse;
// }
