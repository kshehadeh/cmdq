import { q } from "../src";
import { getopts } from "../src";

const options = getopts(process.argv, {
    string: [
        'directory',
        'pattern',
        'search'
    ],
    alias: { 
        d: 'directory',
        p: 'pattern',
        s: 'search'
    },
})

if (!options.directory) {
    options.directory = '.'
}

if (!options.pattern) {
    options.pattern = '*.ts'
}

if (!options.search) {
    console.log('Please provide a search term using the -s flag')
    process.exit(1)
}

console.log(q(options.directory)
    .cmd(`find ${options.directory} -name '${options.pattern}'`)    
    .pipe(`xargs grep "${options.search}"`)
    .run()
    .lastOut()
)




