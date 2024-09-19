export { 
    q,
    r, 
    CommandQueue
} from "./command-queue.js";

export { 
    type CommandQueueConfig, 
    type CommandQueueResult, 
    type CmdOptions, 
    type CommandInput 
} from "./types.js";

export { 
    setGlobalConfig, 
    getGlobalConfig 
} from "./context.js";

export { default as getopts } from "./command-input.js";