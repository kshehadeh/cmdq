export { 
    q,
    r, 
    CommandQueue
} from "./command-queue";

export { 
    type CommandQueueConfig, 
    type CommandQueueResult, 
    type CmdOptions, 
    type CommandInput 
} from "./types";

export { 
    setGlobalConfig, 
    getGlobalConfig 
} from "./context";

export { default as getopts } from "./command-input";