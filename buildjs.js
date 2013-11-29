/*jslint node: true*/

'use strict';

var fs = require('fs');

var buildFile;

var macros = {
	inc: {
		action: function (incfile, file, js, index) {
			if (/^".*"$/.test(incfile)) {
				incfile = incfile.slice(1, -1);
			}
			return js.slice(0, index) + buildFile(incfile, (file.match(/^.*\//) || ['./'])[0]) + js.slice(index);
		},
		argc: 1
	},
	def: {
		action: function (name, value, file, js) {
			return js.replace(new RegExp(name, 'g'), value);
		},
		argc: 2
	}
};

var ignorable = '^[ \\t\\n\\r]+$';

var skip = function (tokens) {
	while (tokens.length > 0 && new RegExp(ignorable).test(tokens[0])) {
		tokens.shift();
	}
};

var parseArg = function (tokens) {
	var arg = '';
	var levels = {
		'(': 0,
		'[': 0,
		'{': 0
	};
	while (tokens.length > 0 && (!new RegExp(ignorable).test(tokens[0]) || levels['('] > 0 || levels['['] > 0 || levels['{'] > 0)) {
		var tk = tokens.shift();
		switch (tk) {
			case '(':
			case '[':
			case '{':
				levels[tk]++;
				break;
			case ')':
				levels['(']--;
				break;
			case ']':
				levels['[']--;
				break;
			case '}':
				levels['{']--;
				break;
		}
		arg += tk;
	}
	for (var key in levels) {
		if (levels[key] > 0) {
			throw new Error('Unmatched token \'' + key + '\'');
		}
	}
	return arg;
}

var parse = function (code) {
	var tokens = code.match(/@\w+|".*?"|'.*?'|[\w_$]+|[\s\S]/g);
	var coms = [];
	while (tokens.length > 0) {
		var token = tokens.shift();
		if (token[0] === '@') {
			token = token.slice(1);
			var com = macros[token];
			if (!com) {
				throw new Error('Invalid command @' + token);
			}
			skip(tokens);
			
			var args = [];
			while (tokens.length > 0 && args.length < com.argc) {
				args.push(parseArg(tokens));
				skip(tokens);
			}
			if (args.length < com.argc) {
				throw new Error('Expected ' + com.argc + ' argument' + (com.argc > 1 ? 's' : '') + ' for @' + token + ', but only ' + args.length + ' ' + (args.length > 1 ? 'were' : 'was') + ' found');
			}
			coms.push({
				command: com,
				args: args
			})
		}
		skip(tokens);
	}
	return coms;
};

var exec = function (coms, file, js, index) {
	while (coms.length > 0) {
		var com = coms.shift();
		js = com.command.action.apply(this, com.args.concat(file, js, index));
	}
	return js;
}

buildFile = function (file, basedir) {
	if (basedir) {
		process.chdir(basedir);
	}
	if (!fs.existsSync(file)) {
		throw new Error('File not found \'' + file + '\'', file);
	}
	var js = fs.readFileSync(file, 'utf-8');
	var re = /\/\*buildjs[\s\S]*?\*\//g;
	var code;
	while ((code = re.exec(js)) !== null) {
		try {
			var coms = parse(code[0].slice(9, -2));
			Array.prototype.splice.call(js, code.index, code[0].length);
			js = js.slice(0, code.index) + js.slice(code.index + code[0].length);
			js = exec(coms, file, js, code.index);
		} catch (ex) {
			var line = (js.slice(0, code.index).match(/\n/g) || []).length;
			if (!ex.caught) {
				ex = new Error(ex.message, file, line);
				ex.caught = true;
				ex.fileStack = [];
				ex.lineStack = [];
			}
			ex.fileStack.push(file);
			ex.lineStack.push(line);
			throw ex;
		}
	}
	return js;
};

var build = function (file, basedir) {
	try {
		return buildFile(file, basedir);
	} catch (ex) {
		var msg = '';
		for (var i = 0; i < ex.fileStack.length; i++) {
			msg += '\n    at ' + ex.fileStack[i] + ':' + ex.lineStack[i];
		}
		throw new Error(ex.message + msg, file, ex.line);
	}
};

var toFile = function (infiles, outfile, basedir) {
	if (typeof infiles !== 'object' || isNaN(infiles.length)) {
		infiles = [infiles];
	}
	if (!outfile) {
		throw new Error('You must define an output file');
	}
	if (!basedir) {
		basedir = process.cwd();
	}
	var js = '';
	for (var i = 0; i < infiles.length; i++) {
		js += build(infiles[i], basedir);
	}
	process.chdir(basedir);
	fs.writeFileSync(outfile, js);
};

module.exports = {
	version: '1.0.0',
	build: build,
	toFile: toFile
};