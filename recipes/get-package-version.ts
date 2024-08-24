import { q } from "../src";
import { getopts } from "../src";

const options = getopts(process.argv, {
    string: ['directory'],
    alias: { d: 'directory' },
})

console.log(q(options.directory)
    .add('npm pkg get version')
    .run()
    .firstOut()
)


