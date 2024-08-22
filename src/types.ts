export type PipeType = 'stdout' | 'stderr' | 'both' | 'none'

export interface CommandInput {
    command: string
    id: string
    continueOnError?: boolean
    pipe?: PipeType
    pre?: (result: CommandQueueResult | null) => boolean
    post?: (result: CommandQueueResult) => CommandQueueResult
}


export interface CommandQueueResult {
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

export interface CommandQueueConfig {
    workingDirectory: string
    enableTrace?: boolean    
    continueOnError?: boolean
    dryRun?: boolean
    dryRunResultsFile?: string
} 

export const isConfig = (configOrCwd: CommandQueueConfig | string): configOrCwd is CommandQueueConfig => {
    return (configOrCwd as CommandQueueConfig).workingDirectory !== undefined
}

export type CmdOptions = Partial<Omit<CommandInput, 'command'>>