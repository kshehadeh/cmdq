import { CommandChain } from "../src";
import { getopts } from "../src";

const options = getopts(process.argv, {
    string: ['directory'],
    alias: { d: 'directory' },
})

console.log(new CommandChain(options.directory)
    .add('npm pkg get version')
    .run()
    .firstOut()
)

