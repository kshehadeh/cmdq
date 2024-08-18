import { CommandChainConfig } from "./types";

let globalConfig: CommandChainConfig = {
    workingDirectory: ".",
    enableTrace: false,
    continueOnError: false,
    dryRun: false,
    dryRunResultsFile: undefined,
}

export function setGlobalConfig(config: CommandChainConfig) {
    globalConfig = config
}

export function getGlobalConfig() {
    return globalConfig
}