import { CommandQueueConfig } from "./types";

let globalConfig: CommandQueueConfig = {
    workingDirectory: ".",
    enableTrace: false,
    continueOnError: false,
    dryRun: false,
    dryRunResultsFile: undefined,
}

export function setGlobalConfig(config: CommandQueueConfig) {
    globalConfig = config
}

export function getGlobalConfig() {
    return globalConfig
}