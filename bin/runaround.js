#!/usr/bin/env node
var Emulator = require('../src/emulator').Emulator;
/*
startEmulator('fastemulator', function() {
	console.log('started!', arguments);
});
*/

var argv = require('optimist')
.usage('start an android emulator then install and run a package\nUsage: $0')
.describe('avd', 'the name of the avd to launch')
.describe('port', 'the port of an already running emulator to connect to')
.describe('install', 'path to the apk to install')
.describe('run', 'run the activity after it is installed')
.describe('emulator-options', 'extra options to pass to the emulator')
.boolean('run')
.check(function(argv) {
	if (!(argv.avd || argv.port)) {
		throw "Error, you must provide either avd or port";
	}
})
.argv;

var e = new Emulator({
	extra: argv['emulator-options'],
	avd: argv.avd,
	port: argv.port
});
e.start(function() {
	if (argv.install) {
		e.install(argv.install, argv.run);
	};
});
