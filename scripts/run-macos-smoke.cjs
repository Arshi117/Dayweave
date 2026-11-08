const { spawn } = require('node:child_process')
const { resolve } = require('node:path')
const electron = require('electron')
const environment = {...process.env}
delete environment.ELECTRON_RUN_AS_NODE
const child=spawn(electron,[resolve(__dirname,'verify-macos.cjs')],{env:environment,stdio:'inherit'})
const timer=setTimeout(()=>{console.error('macOS smoke subprocess timed out');child.kill('SIGKILL');process.exitCode=1},45000)
child.on('error',error=>{console.error(error);clearTimeout(timer);process.exitCode=1})
child.on('exit',(code,signal)=>{clearTimeout(timer);if(code!==0||signal)console.error('macOS smoke exit:',code,signal);process.exitCode=code|| (signal?1:0)})
