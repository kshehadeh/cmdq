import { q } from "../src";

console.log(q()
    .cmd('echo "{ \\"name\\": \\"John\\" }"')
    .pipe('jq .name')
    .pipe('tr -d \'"\'')
    .run()
    .lastOut())
