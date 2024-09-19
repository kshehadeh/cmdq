import { spawnSync } from 'child_process'
import { isNativeError } from 'util/types'
import fs from 'fs'
import { CommandInput, CommandQueueResult, CommandQueueConfig, PipeType, CmdOptions, isConfig } from './types.js'
import { randomString } from './util.js'
import { getGlobalConfig } from './context.js'

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
        let lastResult: CommandQueueResult | undefined = undefined

        for (let i = 0; i < this.commands.length; i++) {
            const command = this.commands[i]
            const nextCommand = this.commands[i + 1]
            const cmd = command.command

            if (this.shouldSkipCommand(command, lastResult)) {
                lastResult = this.handleSkippedCommand(command, cmd)
            } else if (this.shouldPipeCommand(nextCommand)) {
                lastResult = this.handlePipedCommand(lastResult, command, cmd, nextCommand)
            } else {
                lastResult = this.handleExecCommand(lastResult, command, cmd, i)
            }

            if (!lastResult?.result.success) {
                this.trace(`Command failed with: ${lastResult?.result.message}`)
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

    private shouldPipeCommand(nextCommand: CommandInput | undefined) {
        return nextCommand && nextCommand.pipe && nextCommand.pipe !== 'none'
    }

    private shouldSkipCommand(command: CommandInput, lastResult: CommandQueueResult | undefined) {
        return !this.preHandler(lastResult ?? null) ||
        (command.pre && !command.pre(lastResult))
    }

    private handleExecCommand(lastResult: CommandQueueResult | undefined, command: CommandInput, cmd: string, currentIndex: number) {

        // Construct pipe chain by walking the command queue backwards and add the commands
        //  that are piped to the current command - stop when you reach a command that is not piped.
        let pipeChain = cmd
        for (let j = currentIndex - 1; j >= 0; j--) {
            const prevResult = this.results[j]
            if (prevResult.piped !== 'none') {
                switch (prevResult.piped) {
                    case 'stdout':
                        pipeChain = prevResult.command + ' | ' + pipeChain
                        break
                    case 'stderr':
                        pipeChain = prevResult.command + ' 2>&1 1>/dev/null | ' + pipeChain
                        break
                    case 'both':
                        pipeChain = prevResult.command + ' 2>&1 | ' + pipeChain
                        break
                    default:
                        throw new Error('Invalid pipe type')
                }
            } else {
                break
            }
        }

        const [out, err, stat] = this.exec(pipeChain, this.config.workingDirectory, lastResult, command.pipe)
        this.trace(`Command Run${this.config.dryRun ? ' [DRYRUN]' : ''}: ${this.commandAbbreviator(cmd)} => ${stat}`)
        let newLastResult: CommandQueueResult = {
            id: command.id,
            command: pipeChain,
            skipped: false,
            piped: 'none',
            out,
            err,
            stat,
            result: {
                success: false,
                message: '',
            },
        }

        if (!newLastResult) {
            // This should never happen but there might be an issue with 
            //  typescript where it doesn't recognize that lastResult is
            //  defined at this point.
            throw new Error('Command result is undefined')
        }

        newLastResult = this.postHandler(newLastResult)
        if (command.post) {
            newLastResult = command.post(newLastResult)
        }

        this.results.push(newLastResult)

        return newLastResult
    }

    private handlePipedCommand(lastResult: CommandQueueResult | undefined, command: CommandInput, cmd: string, nextCommand: CommandInput) {
        const newLastResult: CommandQueueResult = {
            id: command.id,
            command: cmd,
            piped: nextCommand.pipe || 'none',
            skipped: false,
            out: '',
            err: '',
            stat: 0,
            result: {
                success: true,
                message: 'Piped to following command',
            },
        }
        this.trace(`Command Piped${this.config.dryRun ? ' [DRYRUN]' : ''}: ${this.commandAbbreviator(cmd)}`)
        this.results.push(newLastResult)
        return newLastResult
    }

    private handleSkippedCommand(command: CommandInput, cmd: string) {

        const newLastResult: CommandQueueResult = {
            id: command.id,
            command: cmd,
            skipped: true,
            piped: 'none',
            out: '',
            err: '',
            stat: 0,
            result: {
                success: false,
                message: 'Command skipped',
            },
        }
        this.trace(`Command Skipped${this.config.dryRun ? ' [DRYRUN]' : ''}: ${this.commandAbbreviator(cmd)}`)
        this.results.push(newLastResult)
        return newLastResult
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
     * Returns the first unskipped command result in the chain.
     * @returns 
     */
    first(): CommandQueueResult | undefined {
        // Find the first unskipped command
        for (let i = 0; i < this.results.length; i++) {
            if (!this.results[i].skipped) {
                return this.results[i]
            }
        }
    }

    /**
     * Returns the last command result in the chain.
     * @returns 
     */
    last(): CommandQueueResult | undefined {
        // Find the last unskipped command
        for (let i = this.results.length - 1; i >= 0; i--) {
            if (!this.results[i].skipped) {
                return this.results[i]
            }
        }
        return undefined
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
    private exec(cmd: string, workingDirectory: string, lastResult?: CommandQueueResult, pipe?: PipeType): [string, string, number] {
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
                    // If we're piping the output of the previous command to the input of the current command then...
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
