import { CommandChain } from "../src";
import { getopts } from "../src";

const options = getopts(process.argv, {
    string: ['directory'],
    alias: { d: 'directory' },
})

console.log(new CommandChain(options.directory)
    .add('rm -rf node_modules')
    .add('rm -rf dist')
    .add('npm install')
    .add('npm run build')
    .run()
    .results)
