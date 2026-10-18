// Tiny test helpers: print PASS/FAIL per check and exit non-zero if anything failed.
let failed=0;
export function ok(name,cond){if(!cond)failed++;console.log(cond?'PASS':'FAIL',name);}
export function done(){if(failed){console.log(`${failed} failed`);process.exitCode=1;}}
