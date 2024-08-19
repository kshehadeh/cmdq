import { spawnSync } from 'child_process'
import { isNativeError } from 'util/types'
import fs from 'fs'
import { CommandInput, CommandQueueResult, CommandQueueConfig, PipeType, CmdOptions, isConfig } from './types'
import { randomString } from './util'
import { getGlobalConfig } from './context'

const SHOW_COMMAND_LENGTH = 20

/**
 * Represents a queue of commands to be executed.
 */
export class CommandQueue {
    commands: CommandInput[] = []
    config: CommandQueueConfig
    results: CommandQueueResult[] = []
    _cannedResults: Record<string, CommandQueueResult> = {}

    /**
     * Creates a new instance of CommandChain.
     * @param workingDirectory The working directory for the commands.
     */
    constructor(configOrCwd?: CommandQueueConfig | string) {
        if (!configOrCwd) {
            this.config = getGlobalConfig()
        } else if (isConfig(configOrCwd)) {
            this.config = configOrCwd
        } else {
            this.config = {
                ...getGlobalConfig(),
                workingDirectory: configOrCwd,
            }
        }

        if (this.config.dryRun && this.config.dryRunResultsFile) {
            if (fs.existsSync(this.config.dryRunResultsFile)) {
                const raw = fs.readFileSync(this.config.dryRunResultsFile, 'utf-8')
                this._cannedResults = JSON.parse(raw)
            }
        }
    }

    trace(message?: any, ...optionalParams: any[]) {
        if (this.config.enableTrace) {
            console.log(message, ...optionalParams)
        }
    }

    /**
     * Get a command result by id or index.
     * @param idOrIndex
     * @returns
     */
    get(idOrIndex: string | number): CommandQueueResult | undefined {
        if (typeof idOrIndex === 'string') {
            return this.results.find((r) => r.id === idOrIndex)
        } else {
            return this.results[idOrIndex]
        }
    }

    /**
     * Adds a command to the command queue that pipes the output of the previous command to the input of the current command.
     * @param command The command to add.
     * @returns The updated CommandChain instance.
     */
    pipe(command: string, options?: CmdOptions): this {
        return this.add(command, { pipe: 'stdout', ...options })
    }

    /**
     * Adds a command to the command queue. Alias for 'add'.
     * @param command 
     * @param options 
     * @returns 
     */
    cmd(command: string, options?: CmdOptions): this {
        return this.add(command, options)
    }

    /**
     * Adds a command to the command queue.
     * @param command The command to add.
     * @returns The updated CommandChain instance.
     */
    add(command: string, options?: CmdOptions): this {
        let input: CommandInput = {
            continueOnError: this.config.continueOnError || false,
            id: randomString(),
            command,
            ...options,
        }
        this.commands.push(input)

        return this
    }

    reset(): this {
        this.commands = []
        return this
    }

    preHandler(_previousResult: CommandQueueResult | null): boolean {
        return true
    }

    postHandler(result: CommandQueueResult): CommandQueueResult {
        result.result = {
            success: !(result.stat !== 0 && result.err),
            message: result.err,
        }
        return result
    }

    private commandAbbreviator(cmd: string) {
        return cmd.length > SHOW_COMMAND_LENGTH ? cmd.slice(0, SHOW_COMMAND_LENGTH) + '...' : cmd
    }
    
    /**
     * Runs all the commands in the command queue.
     * @returns An array of CommandChainResult objects representing the results of each command.
     */
    run(): CommandQueue {
        this.results = []
        let lastResult: CommandQueueResult | null = null

        for (const command of this.commands) {
            const cmd = command.command

            const cont = this.preHandler(lastResult)
            if (!cont || (command.pre && !command.pre(lastResult))) {
                this.trace(`Command Skipped${this.config.dryRun ? ' [DRYRUN]' : ''}: ${this.commandAbbreviator(cmd)}`)
                continue
            }

            const [out, err, stat] = this.exec(cmd, this.config.workingDirectory, lastResult, command.pipe)
            this.trace(`Command Run${this.config.dryRun ? ' [DRYRUN]' : ''}: ${this.commandAbbreviator(cmd)} => ${stat}`)
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
            
            lastResult = this.postHandler(lastResult)
            if (command.post) {
                lastResult = command.post(lastResult)
            }            

            this.results.push(lastResult)
            if (!lastResult.result.success) {
                this.trace(`Command failed with: ${lastResult.result.message}`)
                if (!command.continueOnError) {
                    break
                }
            }
        }

        if (this.config.dryRunResultsFile && !this.config.dryRun) {
            if (this.save(this.config.dryRunResultsFile, true)) {
                this.trace(`Saved canned results to file: ${this.config.dryRunResultsFile}`)
            } else {
                this.trace(`Unable to save canned results to file: ${this.config.dryRunResultsFile}`)
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
        return this.results
            .filter(r => !r.result.success && r.result.message)
            .map((result) => result.result.message.trim()
        ).join('\n')
    }

    /**
     * Checks if all the commands in the command queue were successful.
     * @returns True if all commands were successful, false otherwise.
     */
    success(): boolean {
        return this.results.every((result) => result.result.success)
    }

    /**
     * Checks if there are any commands in the command queue that failed.
     * @returns True if there are failed commands, false otherwise.
     */
    hasErrors(): boolean {
        return this.results.some((result) => !result.result.success)
    }

    /**
     * Returns the first command result in the chain.
     * @returns 
     */
    first(): CommandQueueResult | undefined {
        return this.results.at(0)
    }

    /**
     * Returns the last command result in the chain.
     * @returns 
     */
    last(): CommandQueueResult | undefined {
        return this.results.at(-1)
    }

    /**
     * Returns the first command result output in the chain.
     * @returns 
     */
    firstOut(): string | undefined {
        return this.first()?.out.trim()
    }

    /**
     * Returns the last command result output in the chain.
     * @returns 
     */
    lastOut(): string | undefined {
        return this.last()?.out.trim()
    }

    /**
     * Save the command queue to a file to play back another time.
     * @param path The path to the file.
     * @param append Whether to append to an existing file or overwrite it.
     * @returns True if the commands were successfully saved, false otherwise.
     */
    save(path: string, append: boolean): boolean {
        try {
            // Save the results to a file
            let commands = {} as Record<string, CommandQueueResult>
            if (append) {
                // check if the file exists
                if (fs.existsSync(path)) {
                    // read the contents of the file first
                    const raw = fs.readFileSync(path, 'utf-8')
                    commands = JSON.parse(raw)
                }
            }

            for (const r of this.results) {
                commands[r.command] = r
            }

            fs.writeFileSync(path, JSON.stringify(commands, null, 2), { flag: 'w+' })

            return true
        } catch (error) {
            if (isNativeError(error)) {
                this.trace(`Error saving commands to file: ${error.message}`)
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
    private exec(cmd: string, workingDirectory: string, lastResult: CommandQueueResult | null, pipe?: PipeType): [string, string, number] {
        try {
            if (this.config.dryRun) {
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
                let input = undefined
                if (lastResult && pipe) {
                    if (pipe === 'stdout') {
                        input = lastResult.out
                    } else if (pipe === 'stderr') {
                        input = lastResult.err
                    } else if (pipe === 'both') {
                        input = lastResult.out + lastResult.err
                    }
                }

                const result = spawnSync(cmd, { shell: true, cwd: workingDirectory, input: input ? Buffer.from(input) : undefined })
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

/**
 * Creates a new instance of a CommandChain
 * @param config 
 * @returns 
 */
export function q(config?: CommandQueueConfig | string): CommandQueue {
    return new CommandQueue(config)
}

/**
 * Executes a single command and returns the result.
 * @param cmd The command to execute.
 * @param cmdOptions The command options.
 * @param qOptions The command queue options.
 * @returns 
 */
export function r(cmd: string, cmdOptions?: CommandInput, qOptions?: CommandQueueConfig): CommandQueueResult | undefined {
    return new CommandQueue(qOptions).add(cmd, cmdOptions).run().first()
}
