const request = require('request')
const scripts = require('script-tags')
const BASE_URL = "https://www.instagram.com/"
const APPLE_USER_AGENT = "Instagram 123.0.0.21.114 (iPhone; CPU iPhone OS 11_4 like Mac OS X; en_US; en-US; scale=2.00; 750x1334) AppleWebKit/605.1.15"
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.87 Safari/537.36"
const GRAPHQL_URL = BASE_URL + 'graphql/query/?query_hash=42323d64886122307be10013ad2dcc44&variables={"id"%3A"$ID"%2C"first"%3A50%2C"after"%3A"$END%3D%3D"}'
const POST_URL = BASE_URL + "p/"
const jar = request.jar();
request.jar().setCookie("ig_pr", "1");


async function scrapeProfile(username) {

  return new Promise(async (resolve, reject) => {
    const token = await createSession()
    const job = await getInitialProfile(username, token)
    const images = await doWork(getMediaWorker, job)
    for (i = 0; i < images.length; i++) {
      images[i].original = images[i].src
      images[i].src = "http://localhost:2001/backend/translateimage?url=" + encodeURIComponent(images[i].src)
      images[i].thumbnail = "http://localhost:2001/backend/translateimage?url=" + encodeURIComponent(images[i].thumbnail)
    }
    resolve(images)
  })
}

function getInitialProfile(username, token) {
  return new Promise((resolve, reject) => {
    request({ url: BASE_URL + username, headers: { "Referer": BASE_URL, "user-agent": APPLE_USER_AGENT, "X-CSRFToken": token }, jar }, async (error, response, body) => {
      const script = scripts(body)

      const initJson = script[4].text.substring(script[4].text.indexOf('{') + 1).slice(0, -1)
      const parsedData = JSON.parse("{" + initJson)

      const userdata = parsedData.entry_data.ProfilePage[0].graphql.user
      const pageInfo = userdata.edge_owner_to_timeline_media
      const after = pageInfo.page_info.end_cursor.substring(0, pageInfo.page_info.end_cursor.length - 2)
      const nextImages = GRAPHQL_URL.replace("$ID", userdata.id).replace("$END", after)
      const imageData = await handleNodes(pageInfo.edges)
      resolve({ content: imageData, url: nextImages, id: userdata.id })
    })

  })
}

async function handleNodes(edges) {
  return new Promise(async (resolve, reject) => {
    const imageData = []
    await asyncForEach(edges, async (item) => {
      if (item.node.__typename == "GraphSidecar") {
        const images = await getSideCarFromShortCode(item.node.shortcode)
        const json = scripts(images)
        let i = 3;
        if (!json[i].text.startsWith("window.")) {
          i = 4;
        }
        const parsedContent = JSON.parse("{" + json[i].text.split("shortcode_media")[1].substring(3).slice(0, -1).split("}}}}")[0] + "}}")
        parsedContent.edge_sidecar_to_children.edges.forEach((sideCarItem) => {
          const node = sideCarItem.node
          imageData.push({ src: node.display_url, w: node.dimensions.width, h: node.dimensions.height, thumbnail: node.display_resources[0].src })
        })
      } else {
        const node = item.node
        imageData.push({ src: node.display_url, w: node.dimensions.width, h: node.dimensions.height, thumbnail: node.thumbnail_src })
      }
    })
    resolve(imageData)

  })
}

async function getMediaWorker(url, id, content, report) {
  request({ url, jar }, async (error, response, body) => {
    const respObj = JSON.parse(body)
    const hasMore = respObj.data.user.edge_owner_to_timeline_media.page_info.has_next_page
    const pageInfo = respObj.data.user.edge_owner_to_timeline_media
    const imageData = await handleNodes(respObj.data.user.edge_owner_to_timeline_media.edges)
    if (hasMore) {
      const after = pageInfo.page_info.end_cursor.substring(0, pageInfo.page_info.end_cursor.length - 2)
      const newUrl = GRAPHQL_URL.replace("$ID", id).replace("$END", after)
      return report({ hasMore: true, content: content.concat(imageData), url: newUrl, id: id })
    } else {
      return report({ hasMore: false, content: content.concat(imageData) })
    }
  })
}

function doWork(worker, job) {
  return new Promise((resolve, reject) => {
    function report(newJob) {
      console.log(newJob.url)
      if (!newJob.hasMore)
        resolve(newJob.content)
      else
        worker(newJob.url, newJob.id, newJob.content, report)
    }
    worker(job.url, job.id, job.content, report);
  })
}


async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

function getSideCarFromShortCode(shortcode) {
  return new Promise((resolve, reject) => {
    request({ url: POST_URL + shortcode, jar }, (error, response, body) => {
      resolve(body)
    })
  })
}

function createSession() {
  return new Promise((resolve, reject) => {
    request({ url: BASE_URL, headers: { "Referer": BASE_URL, "user-agent": APPLE_USER_AGENT }, jar }, (error, response, body) => {
      resolve(response.headers["set-cookie"][7].split(";")[0].split("=")[1])
    })
  })
}

module.exports = scrapeProfile
