'use strict';

var gulp      = require('gulp');
var fs        = require('fs');
var pkg       = require('./package.json');
var iopackage = require('./io-package.json');
var version   = (pkg && pkg.version) ? pkg.version : iopackage.common.version;
/*var appName   = getAppName();

function getAppName() {
    var parts = __dirname.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1].split('.')[0].toLowerCase();
}
*/
const fileName = 'words.js';
var languages =  {
    en: {},
    de: {},
    ru: {},
    pt: {},
    nl: {},
    fr: {},
    it: {},
    es: {},
    pl: {}
};

function lang2data(lang, isFlat) {
    var str = isFlat ? '' : '{\n';
    var count = 0;
    for (var w in lang) {
        if (lang.hasOwnProperty(w)) {
            count++;
            if (isFlat) {
                str += (lang[w] === '' ? (isFlat[w] || w) : lang[w]) + '\n';
            } else {
                var key = '  "' + w.replace(/"/g, '\\"') + '": ';
                str += key + '"' + lang[w].replace(/"/g, '\\"') + '",\n';
            }
        }
    }
    if (!count) return isFlat ? '' : '{\n}';
    if (isFlat) {
        return str;
    } else {
        return str.substring(0, str.length - 2) + '\n}';
    }
}

function readWordJs(src) {
    try {
        var words;
        if (fs.existsSync(src + 'js/' + fileName)) {
            words = fs.readFileSync(src + 'js/' + fileName).toString();
        } else {
            words = fs.readFileSync(src + fileName).toString();
        }

        var lines = words.split(/\r\n|\r|\n/g);
        var i = 0;
        while (!lines[i].match(/^systemDictionary = {/)) {
            i++;
        }
        lines.splice(0, i);

        // remove last empty lines
        i = lines.length - 1;
        while (!lines[i]) {
            i--;
        }
        if (i < lines.length - 1) {
            lines.splice(i + 1);
        }

        lines[0] = lines[0].replace('systemDictionary = ', '');
        lines[lines.length - 1] = lines[lines.length - 1].trim().replace(/};$/, '}');
        words = lines.join('\n');
        var resultFunc = new Function('return ' + words + ';');

        return resultFunc();
    } catch (e) {
        return null;
    }
}
function padRight(text, totalLength) {
    return text + (text.length < totalLength ? new Array(totalLength - text.length).join(' ') : '');
}
function writeWordJs(data, src) {
    var text = '';
    text += '/*global systemDictionary:true */\n';
    text += '\'use strict\';\n\n';
    text += 'systemDictionary = {\n';
    for (var word in data) {
        if (data.hasOwnProperty(word)) {
            text += '    ' + padRight('"' + word.replace(/"/g, '\\"') + '": {', 50);
            var line = '';
            for (var lang in data[word]) {
                if (data[word].hasOwnProperty(lang)) {
                    line += '"' + lang + '": "' + padRight(data[word][lang].replace(/"/g, '\\"') + '",', 50) + ' ';
                }
            }
            if (line) {
                line = line.trim();
                line = line.substring(0, line.length - 1);
            }
            text += line + '},\n';
        }
    }
    text += '};';
    if (fs.existsSync(src + 'js/' + fileName)) {
        fs.writeFileSync(src + 'js/' + fileName, text);
    } else {
        fs.writeFileSync(src + '' + fileName, text);
    }
}

const EMPTY = '';

function words2languages(src) {
    var langs = Object.assign({}, languages);
    var data = readWordJs(src);
    if (data) {
        for (var word in data) {
            if (data.hasOwnProperty(word)) {
                for (var lang in data[word]) {
                    if (data[word].hasOwnProperty(lang)) {
                        langs[lang][word] = data[word][lang];
                        //  pre-fill all other languages
                        for (var j in langs) {
                            if (langs.hasOwnProperty(j)) {
                                langs[j][word] = langs[j][word] || EMPTY;
                            }
                        }
                    }
                }
            }
        }
        if (!fs.existsSync(src + 'i18n/')) {
            fs.mkdirSync(src + 'i18n/');
        }
        for (var l in langs) {
            if (!langs.hasOwnProperty(l)) continue;
            var keys = Object.keys(langs[l]);
            keys.sort();
            var obj = {};
            for (var k = 0; k < keys.length; k++) {
                obj[keys[k]] = langs[l][keys[k]];
            }
            if (!fs.existsSync(src + 'i18n/' + l)) {
                fs.mkdirSync(src + 'i18n/' + l);
            }

            fs.writeFileSync(src + 'i18n/' + l + '/translations.json', lang2data(obj));
        }
    } else {
        console.error('Cannot read or parse ' + fileName);
    }
}
function words2languagesFlat(src) {
    var langs = Object.assign({}, languages);
    var data = readWordJs(src);
    if (data) {
        for (var word in data) {
            if (data.hasOwnProperty(word)) {
                for (var lang in data[word]) {
                    if (data[word].hasOwnProperty(lang)) {
                        langs[lang][word] = data[word][lang];
                        //  pre-fill all other languages
                        for (var j in langs) {
                            if (langs.hasOwnProperty(j)) {
                                langs[j][word] = langs[j][word] || EMPTY;
                            }
                        }
                    }
                }
            }
        }
        var keys = Object.keys(langs.en);
        keys.sort();
        for (var l in langs) {
            if (!langs.hasOwnProperty(l)) continue;
            var obj = {};
            for (var k = 0; k < keys.length; k++) {
                obj[keys[k]] = langs[l][keys[k]];
            }
            langs[l] = obj;
        }
        if (!fs.existsSync(src + 'i18n/')) {
            fs.mkdirSync(src + 'i18n/');
        }
        for (var ll in langs) {
            if (!langs.hasOwnProperty(ll)) continue;
            if (!fs.existsSync(src + 'i18n/' + ll)) {
                fs.mkdirSync(src + 'i18n/' + ll);
            }

            fs.writeFileSync(src + 'i18n/' + ll + '/flat.txt', lang2data(langs[ll], langs.en));
        }
        fs.writeFileSync(src + 'i18n/flat.txt', keys.join('\n'));
    } else {
        console.error('Cannot read or parse ' + fileName);
    }
}
function languagesFlat2words(src) {
    var dirs = fs.readdirSync(src + 'i18n/');
    var langs = {};
    var bigOne = {};
    var order = Object.keys(languages);
    dirs.sort(function (a, b) {
        var posA = order.indexOf(a);
        var posB = order.indexOf(b);
        if (posA === -1 && posB === -1) {
            if (a > b) return 1;
            if (a < b) return -1;
            return 0;
        } else if (posA === -1) {
            return -1;
        } else if (posB === -1) {
            return 1;
        } else {
            if (posA > posB) return 1;
            if (posA < posB) return -1;
            return 0;
        }
    });
    var keys = fs.readFileSync(src + 'i18n/flat.txt').toString().split('\n');

    for (var l = 0; l < dirs.length; l++) {
        if (dirs[l] === 'flat.txt') continue;
        var lang = dirs[l];
        var values = fs.readFileSync(src + 'i18n/' + lang + '/flat.txt').toString().split('\n');
        langs[lang] = {};
        keys.forEach(function (word, i) {
            langs[lang][word] = values[i];
        });

        var words = langs[lang];
        for (var word in words) {
            if (words.hasOwnProperty(word)) {
                bigOne[word] = bigOne[word] || {};
                if (words[word] !== EMPTY) {
                    bigOne[word][lang] = words[word];
                }
            }
        }
    }
    // read actual words.js
    var aWords = readWordJs();

    var temporaryIgnore = ['pt', 'fr', 'nl', 'flat.txt'];
    if (aWords) {
        // Merge words together
        for (var w in aWords) {
            if (aWords.hasOwnProperty(w)) {
                if (!bigOne[w]) {
                    console.warn('Take from actual words.js: ' + w);
                    bigOne[w] = aWords[w]
                }
                dirs.forEach(function (lang) {
                    if (temporaryIgnore.indexOf(lang) !== -1) return;
                    if (!bigOne[w][lang]) {
                        console.warn('Missing "' + lang + '": ' + w);
                    }
                });
            }
        }

    }

    writeWordJs(bigOne, src);
}
function languages2words(src) {
    var dirs = fs.readdirSync(src + 'i18n/');
    var langs = {};
    var bigOne = {};
    var order = Object.keys(languages);
    dirs.sort(function (a, b) {
        var posA = order.indexOf(a);
        var posB = order.indexOf(b);
        if (posA === -1 && posB === -1) {
            if (a > b) return 1;
            if (a < b) return -1;
            return 0;
        } else if (posA === -1) {
            return -1;
        } else if (posB === -1) {
            return 1;
        } else {
            if (posA > posB) return 1;
            if (posA < posB) return -1;
            return 0;
        }
    });
    for (var l = 0; l < dirs.length; l++) {
        if (dirs[l] === 'flat.txt') continue;
        var lang = dirs[l];
        langs[lang] = fs.readFileSync(src + 'i18n/' + lang + '/translations.json').toString();
        langs[lang] = JSON.parse(langs[lang]);
        var words = langs[lang];
        for (var word in words) {
            if (words.hasOwnProperty(word)) {
                bigOne[word] = bigOne[word] || {};
                if (words[word] !== EMPTY) {
                    bigOne[word][lang] = words[word];
                }
            }
        }
    }
    // read actual words.js
    var aWords = readWordJs();

    var temporaryIgnore = ['pt', 'fr', 'nl', 'it'];
    if (aWords) {
        // Merge words together
        for (var w in aWords) {
            if (aWords.hasOwnProperty(w)) {
                if (!bigOne[w]) {
                    console.warn('Take from actual words.js: ' + w);
                    bigOne[w] = aWords[w]
                }
                dirs.forEach(function (lang) {
                    if (temporaryIgnore.indexOf(lang) !== -1) return;
                    if (!bigOne[w][lang]) {
                        console.warn('Missing "' + lang + '": ' + w);
                    }
                });
            }
        }

    }

    writeWordJs(bigOne, src);
}

gulp.task('adminWords2languages', function (done) {
    words2languages('./admin/');
    done();
});

gulp.task('adminWords2languagesFlat', function (done) {
    words2languagesFlat('./admin/');
    done();
});

gulp.task('adminLanguagesFlat2words', function (done) {
    languagesFlat2words('./admin/');
    done();
});

gulp.task('adminLanguages2words', function (done) {
    languages2words('./admin/');
    done();
});


gulp.task('updatePackages', function (done) {
    iopackage.common.version = pkg.version;
    iopackage.common.news = iopackage.common.news || {};
    if (!iopackage.common.news[pkg.version]) {
        var news = iopackage.common.news;
        var newNews = {};

        newNews[pkg.version] = {
            en: 'news',
            de: 'neues',
            ru: 'новое'
        };
        iopackage.common.news = Object.assign(newNews, news);
    }
    fs.writeFileSync('io-package.json', JSON.stringify(iopackage, null, 4));
    done();
});

gulp.task('rename', function ()  {
    var newname;
    var author = '@@Author@@';
    var email  = '@@email@@';
    for (var a = 0; a < process.argv.length; a++) {
        if (process.argv[a] === '--name') {
            newname = process.argv[a + 1]
        } else if (process.argv[a] === '--email') {
            email = process.argv[a + 1]
        } else if (process.argv[a] === '--author') {
            author = process.argv[a + 1]
        }
    }


    console.log('Try to rename to "' + newname + '"');
    if (!newname) {
        console.log('Please write the new template name, like: "gulp rename --name mywidgetset" --author "Author Name"');
        process.exit();
    }
    if (newname.indexOf(' ') !== -1) {
        console.log('Name may not have space in it.');
        process.exit();
    }
    if (newname.toLowerCase() !== newname) {
        console.log('Name must be lower case.');
        process.exit();
    }
    if (fs.existsSync(__dirname + '/admin/template.png')) {
        fs.renameSync(__dirname + '/admin/template.png',              __dirname + '/admin/' + newname + '.png');
    }
    if (fs.existsSync(__dirname + '/widgets/template.html')) {
        fs.renameSync(__dirname + '/widgets/template.html',           __dirname + '/widgets/' + newname + '.html');
    }
    if (fs.existsSync(__dirname + '/widgets/template/js/template.js')) {
        fs.renameSync(__dirname + '/widgets/template/js/template.js', __dirname + '/widgets/template/js/' + newname + '.js');
    }
    if (fs.existsSync(__dirname + '/widgets/template')) {
        fs.renameSync(__dirname + '/widgets/template',                __dirname + '/widgets/' + newname);
    }
    var patterns = [
        {
            match: /template/g,
            replacement: newname
        },
        {
            match: /Template/g,
            replacement: newname ? (newname[0].toUpperCase() + newname.substring(1)) : 'Template'
        },
        {
            match: /@@Author@@/g,
            replacement: author
        },
        {
            match: /@@email@@/g,
            replacement: email
        }
    ];
    var files = [
        __dirname + '/io-package.json',
        __dirname + '/LICENSE',
        __dirname + '/package.json',
        __dirname + '/README.md',
        __dirname + '/main.js',
        __dirname + '/Gruntfile.js',
        __dirname + '/widgets/' + newname +'.html',
        __dirname + '/www/index.html',
        __dirname + '/admin/index.html',
        __dirname + '/admin/index_m.html',
        __dirname + '/widgets/' + newname + '/js/' + newname +'.js',
        __dirname + '/widgets/' + newname + '/css/style.css'
    ];
    files.forEach(function (f) {
        try {
            if (fs.existsSync(f)) {
                var data = fs.readFileSync(f).toString('utf-8');
                for (var r = 0; r < patterns.length; r++) {
                    data = data.replace(patterns[r].match, patterns[r].replacement);
                }
                fs.writeFileSync(f, data);
            }
        } catch (e) {

        }
    });
});

gulp.task('updateReadme', function (done) {
    var readme = fs.readFileSync('README.md').toString();
    var pos = readme.indexOf('## Changelog\n');
    if (pos !== -1) {
        var readmeStart = readme.substring(0, pos + '## Changelog\n'.length);
        var readmeEnd   = readme.substring(pos + '## Changelog\n'.length);

        if (readme.indexOf(version) === -1) {
            var timestamp = new Date();
            var date = timestamp.getFullYear() + '-' +
                ('0' + (timestamp.getMonth() + 1).toString(10)).slice(-2) + '-' +
                ('0' + (timestamp.getDate()).toString(10)).slice(-2);

            var news = '';
            if (iopackage.common.news && iopackage.common.news[pkg.version]) {
                news += '* ' + iopackage.common.news[pkg.version].en;
            }

            fs.writeFileSync('README.md', readmeStart + '### ' + version + ' (' + date + ')\n' + (news ? news + '\n\n' : '\n') + readmeEnd);
        }
    }
    done();
});

gulp.task('default', ['updatePackages', 'updateReadme']);
