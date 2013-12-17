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
.describe('run-activity', 'run an activity')
.describe('kill-package', 'kill a package by package name')
.boolean('run')
.check(function(argv) {
	if (!(argv.avd || argv.port)) {
		throw "Error, you must provide either avd or port";
	}
})
.argv;

var emulator = new Emulator({
	extra: argv['emulator-options'],
	avd: argv.avd,
	port: argv.port
});
emulator.start(function() {
	if (argv.install) {
		e.install(argv.install, argv.run, function(e) {
			if (e) {
				console.error('Error installing apk');
				process.exit(1);
			}
		});
	} else if (argv['run-activity']) {
		console.log('running activity', argv['run-activity']);
		emulator.runActivity(argv['run-activity'], function(e) {
			if (e) {
				console.log('error running activity');
				proces.exit(1);
			}
		});
	} else if (argv['kill-package']) {
		emulator.killPackage(argv['kill-package'], function(e) {
			if (e) {
				console.log('error killing package');
			}
		})
	}
});
