const request = require('request')
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
})
var scripts = require('script-tags')
const fs = require('fs')

init()

async function init () {
  const username = await getName()
  initRequest(username)
}

function initRequest (name) {
  request('https://www.instagram.com/' + name + '/', (error, response, body) => {
    if (error) {
      console.log('Unable to make initial request')
    }
    const scrips = scripts(body)
    const initJson = scrips[4].text.substring(scrips[4].text.indexOf('{') + 1).slice(0, -1)
    try {
      const parsedInitJson = JSON.parse('{' + initJson)
      const userdata = parsedInitJson.entry_data.ProfilePage[0].graphql.user
      const id = userdata.id
      const pageInfo = userdata.edge_owner_to_timeline_media
      const after = pageInfo.page_info.end_cursor.substring(0, pageInfo.page_info.end_cursor.length - 2)
      const newUrl = 'https://www.instagram.com/graphql/query/?query_hash=e769aa130647d2354c40ea6a439bfc08&variables={"id"%3A"' + id + '"%2C"first"%3A12%2C"after"%3A"' + after + '%3D%3D"}'
      const array = pageInfo.edges.map(a => a.node.display_url)
      requestNewUrl(newUrl, id, array, name, 0)
    } catch (e) {
      console.log('Could not get profile for ' + name + ", this might be because it's not a personal account")
    }
  })
}

function requestNewUrl (url, id, array, name, errCounter) {
  request(url, (error, response, body) => {
    if (error) {
      errCounter += 1
      return requestNewUrl(url, id, array, name, errCounter)
    }
    try {
      const respObj = JSON.parse(body)
      const hasMore = respObj.data.user.edge_owner_to_timeline_media.page_info.has_next_page
      const pageInfo = respObj.data.user.edge_owner_to_timeline_media
      if (hasMore) {
        const after = pageInfo.page_info.end_cursor.substring(0, pageInfo.page_info.end_cursor.length - 2)
        const newUrl = 'https://www.instagram.com/graphql/query/?query_hash=e769aa130647d2354c40ea6a439bfc08&variables={"id"%3A"' + id + '"%2C"first"%3A12%2C"after"%3A"' + after + '%3D%3D"}'
        array = [...array, ...respObj.data.user.edge_owner_to_timeline_media.edges.map(a => a.node.display_url)]
        return requestNewUrl(newUrl, id, array, name, 0)
      } else {
        writeFile(array, name)
        return true
      }
    } catch (e) {
      console.log('there was an error')
    }
  })
}

async function writeFile (array, name) {
  makeDir().then(() => {
    fs.writeFile('./profiles/' + name + '.json', JSON.stringify(array), 'utf8', function (err) {
      if (err) {
        return console.error(err)
      }
      console.log('File for ' + name + ' was saved')
    })
  }).catch((e) => {
    console.error(e)
  })
}

async function makeDir () {
  return new Promise((resolve, reject) => {
    const dir = './profiles'
    fs.mkdir(dir, (error) => {
      if (error.code !== 'EEXIST') {
        reject(error)
      }
      resolve(true)
    })
  })
}

function getName () {
  return new Promise((resolve, reject) => {
    readline.question('Instagram username:', (name) => {
      resolve(name)
      readline.close()
    })
  })
}
