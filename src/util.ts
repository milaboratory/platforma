const readlineSync = require('readline-sync');

export function askYN(prompt: string) : boolean {
    const answer = readlineSync.question(`${prompt} [y/N] `)
    return answer.toLowerCase() === 'y'
}

export function assertNever(n: never) {
    throw new Error("this should never happen")
}
