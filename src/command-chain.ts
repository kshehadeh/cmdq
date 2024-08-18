import { spawnSync } from 'child_process'
import { isNativeError } from 'util/types'
import fs from 'fs'
import { CommandInput, CommandChainResult, CommandChainConfig, PipeType, CmdOptions } from './types'
import { isConfig, randomString, commandAbbreviator, checkSuccess } from './util'
import { getGlobalConfig } from './context'

/**
 * Represents a chain of commands to be executed.
 */
export class CommandChain {
    commands: CommandInput[] = []
    config: CommandChainConfig
    results: CommandChainResult[] = []
    _cannedResults: Record<string, CommandChainResult> = {}

    /**
     * Creates a new instance of CommandChain.
     * @param workingDirectory The working directory for the commands.
     */
    constructor(configOrCwd?: CommandChainConfig | string) {
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
    add(command: string | CmdOptions): this {
        let input: CommandInput
        if (typeof command === 'string') {
            input = {
                command,
                id: randomString(),
                continueOnError: this.config.continueOnError || false,
            }
        } else {
            input = {
                id: randomString(),
                continueOnError: this.config.continueOnError || false,
                ...command,
            }
        }

        this.commands.push(input)
        return this
    }

    reset(): this {
        this.commands = []
        return this
    }

    preHandler(_previousResult: CommandChainResult | null): boolean {
        return true
    }

    postHandler(result: CommandChainResult): CommandChainResult {
        const { success, message } = checkSuccess(result)
        result.result = { success, message }
        return result
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
            const preHandler = command.pre || this.preHandler.bind(this)

            if (!preHandler(lastResult)) {
                this.trace(`Command Skipped${this.config.dryRun ? ' [DRYRUN]' : ''}: ${commandAbbreviator(cmd)}`)
                continue
            }

            const [out, err, stat] = this.exec(cmd, this.config.workingDirectory, lastResult, command.pipe)
            this.trace(`Command Run${this.config.dryRun ? ' [DRYRUN]' : ''}: ${commandAbbreviator(cmd)} => ${stat}`)
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

            const postHandler = command.post || this.postHandler.bind(this)
            lastResult = postHandler(lastResult)

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
                    this.trace(`Command already exists in file, overwriting: ${r.command}`)
                }

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
    private exec(cmd: string, workingDirectory: string, lastResult: CommandChainResult | null, pipe?: PipeType): [string, string, number] {
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

                const result = spawnSync(cmd, { shell: true, cwd: workingDirectory, input })
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
