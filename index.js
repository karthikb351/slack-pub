const express = require('express')
const glob = require('glob')
const fs = require('fs')
const path = require('path')
const jsonfile = require('jsonfile');
const loki = require('lokijs');
var db = new loki('Example');

var messages = db.addCollection('messages', { indices: ['ts'] });

const dirs = p => fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory())

var channelFolders = dirs('./archive/archive')

data = {}

for (var i = 0; i < channelFolders.length; i++) {
  var channelName = channelFolders[i]
  var messageFiles = glob.sync('./archive/archive/'+channelName+'/*.json')
  messagesObj = []
  for (var x = 0; x < messageFiles.length; x++) {
    messagesTemp = jsonfile.readFileSync(messageFiles[x])
    for (var k = 0; k < messagesTemp.length; k++) {
      messagesObj.push(messagesTemp[k]['text']);
      messagesTemp[k]['channel_id']=channelName;
      messages.insert(messagesTemp[k])
    }
  }
  data[channelName] = {
    'id': channelName,
    'messages': messages
  }
}

const app = express()

app.set('view engine', 'pug')

app.use('/public', express.static('static'))

app.get('/', function (req, res) {
  res.render('index', { title: 'Hey', message: 'Hello there!' })
})

app.get('/:id', function (req, res) {
  channel = data[req.params.id]
  res.render('index', { title: channel['id'], message: messages.find({'channel_id': req.params.id}).map(x=>x['text'])})
})



app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
