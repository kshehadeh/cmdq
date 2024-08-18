import { spawnSync } from 'child_process'
import { isNativeError } from 'util/types'
import fs from 'fs'

const SHOW_COMMAND_LENGTH = 20

export function randomString() {
    return Math.random().toString(36).substring(7)
}

export interface CommandChainResult {
    id: string
    command: string
    out: string
    err: string
    stat: number
    result: {
        success: boolean
        message: string
    }
}

export interface CommandChainConfig {
    workingDirectory: string,
    enableTrace?: string    
} 

const isConfig = (configOrCwd: CommandChainConfig | string): configOrCwd is CommandChainConfig => {
    return (configOrCwd as CommandChainConfig).workingDirectory !== undefined
}

export interface CommandInput {
    command: string
    id: string
    continueOnError: boolean
    if?: (result: CommandChainResult | null) => boolean
    success?: (result: CommandChainResult) => { success: boolean; message: string }
}

const commandAbbreviator = (cmd: string) => {
    return cmd.length > SHOW_COMMAND_LENGTH ? cmd.slice(0, SHOW_COMMAND_LENGTH) + '...' : cmd
}

export type CmdOptions = Partial<Omit<CommandInput, 'command'>>

/**
 * Checks if a command execution was successful.
 * @param result The result of a command execution.
 * @returns True if the command was successful, false otherwise.
 */
function checkSuccess(result: CommandChainResult): { success: boolean; message: string } {
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

/**
 * Represents a chain of commands to be executed.
 */
export class CommandChain {
    commands: CommandInput[] = []
    workingDirectory: string
    results: CommandChainResult[] = []
    _cannedResults: Record<string, CommandChainResult> = {}
    dryRun: boolean = false
    dryRunResultsFile: string | null = ''
    continueOnError: boolean = false

    /**
     * Creates a new instance of CommandChain.
     * @param workingDirectory The working directory for the commands.
     */
    constructor(configOrCwd: CommandChainConfig | string) {
        this.workingDirectory = isConfig(configOrCwd) ? configOrCwd.workingDirectory : configOrCwd
        this.enableTrace = isConfig(configOrCwd) ? configOrCwd.enableTrace === 'true' : false
        this.dryRun = isConfig(configOrCwd) ? configOrCwd.enableTrace === 'true' : false
        
        this.dryRunResultsFile = process.env.RECORDER_PATH || null

        if (this.dryRun && this.dryRunResultsFile) {
            if (fs.existsSync(this.dryRunResultsFile)) {
                const raw = fs.readFileSync(this.dryRunResultsFile, 'utf-8')
                this._cannedResults = JSON.parse(raw)                
            }
        }
    }

    trace(message?: any, ...optionalParams: any[]) {
        console.log(message, ...optionalParams)
    }
    
    /**
     * Get a command result by id or index.
     * @param idOrIndex
     * @returns
     */
    get(idOrIndex: string | number): CommandChainResult | undefined {
        if (typeof idOrIndex === 'string') {
            return this.results.find((r) => r.id === idOrIndex)
        } else {
            return this.results[idOrIndex]
        }
    }

    /**
     * Executes a single command and returns the result.
     * @param command The command to execute.
     * @param workingDirectory The working directory for the command.
     * @returns The result of the command execution.
     */
    static cmd(command: string, workingDirectory: string): CommandChainResult | undefined {
        return new CommandChain(workingDirectory).add(command).run().first()
    }

    /**
     * Adds a command to the command chain.
     * @param command The command to add.
     * @returns The updated CommandChain instance.
     */
    add(command: string | CommandInput): this {
        let input: CommandInput
        if (typeof command === 'string') {
            input = {
                command,
                id: randomString(),
                continueOnError: this.continueOnError,
            }
        } else {
            input = command
        }

        this.commands.push(input)
        return this
    }

    reset(): this {
        this.commands = []
        return this
    }

    /**
     * Runs all the commands in the command chain.
     * @returns An array of CommandChainResult objects representing the results of each command.
     */
    run(): CommandChain {
        this.results = []
        let lastResult: CommandChainResult | null = null

        for (const command of this.commands) {
            const cmd = command.command

            if (command.if && !command.if(lastResult)) {
                trace(`Command Skipped${this.dryRun ? ' [DRYRUN]' : ''}: ${commandAbbreviator(cmd)}`)
                continue
            }

            const [out, err, stat] = this.exec(cmd, this.workingDirectory)
            trace(`Command Run${this.dryRun ? ' [DRYRUN]' : ''}: ${commandAbbreviator(cmd)} => ${stat}`)
            lastResult = {
                id: command.id,
                command: cmd,
                out,
                err,
                stat,
                result: {
                    success: false,
                    message: '',
                },
            }

            const success = command.success || checkSuccess
            lastResult.result = success(lastResult)

            this.results.push(lastResult)
            if (!lastResult.result.success) {
                trace(`Command failed with: ${lastResult.result.message}`)
                if (!command.continueOnError) {
                    break
                }
            }
        }

        if (this.dryRunResultsFile && !this.dryRun) {
            if (this.save(this.dryRunResultsFile, true)) {
                trace(`Saved canned results to file: ${this.dryRunResultsFile}`)
            } else {
                trace(`Unable to save canned results to file: ${this.dryRunResultsFile}`)
            }
        }

        this.reset()

        return this
    }

    /**
     * Returns a record of commands that failed along with their error messages.
     * @returns A record of commands that failed along with their error messages.
     */
    errors(): Record<string, string> {
        return this.results.reduce((acc, result) => {
            if (!result.result.success) {
                acc[result.command] = result.result.message
            }
            return acc
        }, {} as Record<string, string>)
    }

    /**
     * Returns a flattened string of all the error messages.
     * @returns A flattened string of all the error messages.
     */
    flattenErrors(): string {
        return this.results.map((result) => result.result.message).join('\n')
    }

    /**
     * Checks if all the commands in the command chain were successful.
     * @returns True if all commands were successful, false otherwise.
     */
    success(): boolean {
        return this.results.every((result) => result.result.success)
    }

    /**
     * Checks if there are any commands in the command chain that failed.
     * @returns True if there are failed commands, false otherwise.
     */
    hasErrors(): boolean {
        return this.results.some((result) => !result.result.success)
    }

    first(): CommandChainResult | undefined {
        return this.results.at(0)
    }

    last(): CommandChainResult | undefined {
        return this.results.at(-1)
    }

    firstOut(): string | undefined {
        return this.first()?.out.trim()
    }

    lastOut(): string | undefined {
        return this.last()?.out.trim()
    }

    /**
     * Save the command chain to a file to play back another time.
     * @param path The path to the file.
     * @param append Whether to append to an existing file or overwrite it.
     * @returns True if the commands were successfully saved, false otherwise.
     */
    save(path: string, append: boolean): boolean {
        try {
            // Save the results to a file
            let commands = {} as Record<string, CommandChainResult>
            if (append) {
                // check if the file exists
                if (fs.existsSync(path)) {
                    // read the contents of the file first
                    const raw = fs.readFileSync(path, 'utf-8')
                    commands = JSON.parse(raw)
                }
            }

            for (const r of this.results) {
                if (r.command in commands) {
                    trace(`Command already exists in file, overwriting: ${r.command}`)
                }

                commands[r.command] = r
            }

            fs.writeFileSync(path, JSON.stringify(commands, null, 2), { flag: 'w+' })

            return true
        } catch (error) {
            if (isNativeError(error)) {
                trace(`Error saving commands to file: ${error.message}`)
            }
            return false
        }
    }

    /**
     * Executes a command in the specified working directory.
     *
     * @param cmd - The command to execute.
     * @param workingDirectory - The working directory in which to execute the command.
     * @returns An array containing the stdout, stderr, and status code of the command execution.
     */
    private exec(cmd: string, workingDirectory: string): [string, string, number] {
        try {
            if (this.dryRun) {
                let out = '',
                    err = '',
                    stat = 0
                if (cmd in this._cannedResults) {
                    out = this._cannedResults[cmd].out
                    err = this._cannedResults[cmd].err
                    stat = this._cannedResults[cmd].stat
                }
                return [out, err, stat]
            } else {
                const result = spawnSync(cmd, { shell: true, cwd: workingDirectory })
                return [result.stdout.toString(), result.stderr.toString(), result.status ?? 0]
            }
        } catch (err) {
            if (isNativeError(err)) {
                return ['', err.message, 1]
            } else {
                return ['', 'Unknown error', 1]
            }
        }
    }
}

export function exec(cmd: string, workingDirectory: string): CommandChainResult | undefined {
    return new CommandChain(workingDirectory).add(cmd).run().first()
}

export function execWithOutput(cmd: string, workingDirectory: string): string | undefined  {
    return new CommandChain(workingDirectory).add(cmd).run().firstOut()
}
