const express = require('express')
const glob = require('glob')
const fs = require('fs')
const path = require('path')
const jsonfile = require('jsonfile')
const Loki = require('lokijs')
const moment = require('moment-timezone')
const showdown = require('showdown')
const emoji = require('node-emoji')
const config = require('./config')
var markdownConverter = new showdown.Converter()
var db = new Loki('Example')

var messagesdb = db.addCollection('messages', { indices: ['ts'] })
var usersdb = db.addCollection('users', { indices: ['id'] })
var channelsdb = db.addCollection('channels', { indices: ['id'] })

const dirs = p => fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory())

var channelFolders = dirs('./archive')

var channels = jsonfile.readFileSync('./archive/channels.json')

channelsdb.insert(channels)

var users = jsonfile.readFileSync('./archive/users.json')

usersdb.insert(users)

var count = 0
var skip = 0

for (var i = 0; i < channelFolders.length; i++) {
  var channelName = channelFolders[i]
  var messageFiles = glob.sync('./archive/' + channelName + '/*.json')
  for (var x = 0; x < messageFiles.length; x++) {
    var messagesTemp = jsonfile.readFileSync(messageFiles[x])
    for (var k = 0; k < messagesTemp.length; k++) {
      if (messagesTemp[k]['type'] === 'message' && messagesTemp[k]['subtype'] === undefined) {
        count++
        messagesTemp[k]['channel_id'] = channelName
        messagesTemp[k]['channel'] = channelsdb.findOne({'name': channelName})
        messagesTemp[k]['user_id'] = messagesTemp[k]['user']
        messagesTemp[k]['user'] = usersdb.findOne({'id': messagesTemp[k]['user_id']})
        messagesTemp[k]['ts_pretty'] = moment.unix(messagesTemp[k]['ts']).tz('Asia/Kolkata').format('dddd, MMMM Do YYYY, h:mm:ss a')

        var msg = messagesTemp[k]['text']
        msg = msg.replace(/<@U\d\w+>/g, function (match) {
          var userId = match.slice(2, -1)
          var mentionedUser = usersdb.findOne({'id': userId})
          return '@' + mentionedUser['name']
        })

        msg = msg.replace(/<@U\d\w+\|[A-Za-z0-9.-_]+>/g, function (match) {
          var userId = match.group(0).slice(2, -1)
          var mentionedUser = usersdb.findOne({'id': userId})
          return '@' + mentionedUser['name']
        })

        msg = msg.replace(/<(https|http|mailto):[A-Za-z0-9_.\-/|?,=#:@]+>/g, function (match) {
          return '[' + match.slice(1, -1) + '](' + match.slice(1, -1) + ')'
        })

        msg = emoji.emojify(msg)

        messagesTemp[k]['text'] = markdownConverter.makeHtml(msg)

        if (messagesTemp[k]['thread_ts'] !== undefined && messagesTemp[k]['thread_ts'] !== messagesTemp[k]['ts']) {
          var parentMessage = messagesdb.findOne({'ts': messagesTemp[k]['thread_ts']})
          if (parentMessage) {
            if (parentMessage['children'] === undefined) {
              parentMessage['children'] = []
            }
            parentMessage['children'].push(messagesTemp[k])
            messagesdb.update(parentMessage)
          }
        } else {
          messagesdb.insert(messagesTemp[k])
        }
      } else {
        skip++
      }
    }
  }
}

console.info('Loaded ' + count + ' messages')
console.info('Skipped ' + skip + ' messages')


var publicChannels = channelsdb.chain()
          .find({'is_archived': false})
          .simplesort('name')
          .data()

var archivedChannels = channelsdb.chain()
          .find({'is_archived': true})
          .simplesort('name')
          .data()

const app = express()

app.set('view engine', 'pug')

app.use('/public', express.static('static'))

app.get('/', function (req, res) {
  res.redirect('/general')
})

app.get('/api/:channel_id/messages', function (res, req) {
  var channelId = req.params.channel_id

  var channel = channelsdb.findOne({'name': channelId})

  if (channel === null) {
    res.json({
      'error': 'NOT_FOUND',
      'code': 404
    })
  }

  var page = req.params.page
  var offset = req.params.offset
  if (isNaN(page) || isNaN(offset)) {
    res.json({
      'error': 'NOT_FOUND',
      'code': 404
    })
  }

  console.log(res)
})

app.get('/:id', function (req, res) {
  var channelId = req.params.id

  var channel = channelsdb.findOne({'name': channelId})

  if (channel === null) {
    res.redirect('/')
  }

  var messages = messagesdb.chain()
            .find({'channel_id': channelId})
            .simplesort('ts')
            .data()

  res.render('index', {
    config: config,
    title: channel['name'],
    channel: channel['name'],
    messages: messages,
    public_channels: publicChannels,
    archived_channels: archivedChannels
  })
})


app.listen(process.env.PORT || 3000, function () {
  console.log('slack-pub is running on port 3000! Visit http://localhost:3000/ to view.')
})
