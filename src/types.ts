export type PipeType = 'stdout' | 'stderr' | 'both' | 'none'

export interface CommandInput {
    command: string
    id: string
    continueOnError?: boolean
    pipe?: PipeType
    pre?: (result: CommandChainResult | null) => boolean
    post?: (result: CommandChainResult) => CommandChainResult
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
    workingDirectory: string
    enableTrace?: boolean    
    continueOnError?: boolean
    dryRun?: boolean
    dryRunResultsFile?: string
} 

export type CmdOptions = Partial<Omit<CommandInput, 'command'>>