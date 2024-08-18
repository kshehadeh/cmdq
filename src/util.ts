import { CommandChainConfig, CommandChainResult, CmdOptions, CommandInput } from "./types"

const SHOW_COMMAND_LENGTH = 20

export function randomString() {
    return Math.random().toString(36).substring(7)
}

export const isConfig = (configOrCwd: CommandChainConfig | string): configOrCwd is CommandChainConfig => {
    return (configOrCwd as CommandChainConfig).workingDirectory !== undefined
}

export const commandAbbreviator = (cmd: string) => {
    return cmd.length > SHOW_COMMAND_LENGTH ? cmd.slice(0, SHOW_COMMAND_LENGTH) + '...' : cmd
}



/**
 * Checks if a command execution was successful.
 * @param result The result of a command execution.
 * @returns True if the command was successful, false otherwise.
 */
export function checkSuccess(result: CommandChainResult): { success: boolean; message: string } {
    return {
        success: !(result.stat !== 0 && result.err),
        message: result.err,
    }
}

/**
 * Creates a command input object from a reduced set of options. This is
 * a convenience function to build a command input object when only certain
 * options need to be specified.
 * @param cmd
 * @param options
 * @returns
 */
export function o(cmd: string, options?: CmdOptions): CommandInput {
    const opts = {
        id: randomString(),
        continueOnError: false,
        ...options,
    }

    return {
        command: cmd,
        ...opts,
    }
}