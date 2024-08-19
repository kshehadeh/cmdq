import { CommandQueue, q, setGlobalConfig } from "../src";
import { getopts } from "../src";
import { spawnSync } from 'child_process'

setGlobalConfig({ workingDirectory: '.', enableTrace: true })

const options = getopts(process.argv, {
    string: ['directory'],
    alias: { d: 'directory' },
})

console.log(q(options.directory)
    .cmd('ls')
    // Pipe the output of the ls command to grep to filter out only .js/ts and .jsx/tsx files
    .pipe('grep -E ".*\\.[jt]sx?"', {
        // Modify the output from the grep command to add a > character at the beginning of each line
        post: (result) => {
            return {
                ...result,
                out: result.out.split('\n')
                    .filter((line) => line.trim() !== '')
                    .map((line) => `> ${line.trim()}`)
                    .join('\n')
            }
        }
    })
    .run()
    .lastOut()
)


// const result = spawnSync('grep package.json', { cwd: options.directory, shell: true, input: 'test\ntest2\npackage\n' })
// const input = spawnSync('ls', { cwd: options.directory, shell: true })
// console.log(input.stdout.toString())
// const result = spawnSync('ls | grep package.json', { cwd: options.directory, shell: true, input: input.stdout })
// console.log(result.stdout.toString())