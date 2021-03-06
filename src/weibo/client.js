const { _log, _warn, _err } = require('../utils/log');
const _ = require('lodash');
const Fs = require('fs-extra');
const Path = require('path');
const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const { CookieJar } = require('tough-cookie');
const { stringify } = require('qs');
const { load } = require('cheerio');
const md5 = require('md5');
const getAgent = require('../utils/getAgent');
const retryPromise = require('../utils/retryPromise');

const CACHE_DIR = Path.resolve(__dirname, '../../cache/');
const CONTAINER_ID = '100808fc439dedbb06ca5fd858848e521b8716';
const AXIOS_COMMON_CONFIG = {
  timeout: 10000,
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.96 Safari/537.36',
  },
  withCredentials: true,
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = class WbClient {
  constructor({ alc, proxy, aid, gsid, s, from }) {
    if (aid && gsid && s) {
      this.appCheckinConfig = {
        params: {
          aid,
          gsid,
          s,
          from,
          c: 'weicoabroad',
          request_url: `http://i.huati.weibo.com/mobile/super/active_fcheckin?pageid=${CONTAINER_ID}`,
        },
        headers: {
          'user-agent': 'WeiboOverseas/4.3.5 (iPhone; iOS 14.6; Scale/3.00)',
        },
      };
    }

    this.cookieCacheFile = Path.resolve(CACHE_DIR, `${md5(alc)}.cookie.json`);
    const httpsAgent = getAgent(proxy);

    this.cookieJar = this.loadCookieFromCache();
    this.cookieJar.setCookieSync(`ALC=${alc}`, 'https://login.sina.com.cn/');

    this.axios = axios.create(AXIOS_COMMON_CONFIG);
    axiosCookieJarSupport(this.axios);
    this.axios.defaults.jar = this.cookieJar;

    if (httpsAgent) {
      this.proxyAxios = axios.create({
        ...AXIOS_COMMON_CONFIG,
        httpsAgent,
      });
      axiosCookieJarSupport(this.proxyAxios);
      this.proxyAxios.defaults.jar = this.cookieJar;
    } else this.proxyAxios = this.axios;
  }

  loadCookieFromCache() {
    if (!Fs.existsSync(this.cookieCacheFile)) return new CookieJar();
    _log('?????? cookie ??????');
    try {
      return CookieJar.fromJSON(Fs.readJsonSync(this.cookieCacheFile));
    } catch (error) {
      return new CookieJar();
    }
  }

  saveCookieToCache() {
    _log('?????? cookie ?????????');
    Fs.writeJsonSync(this.cookieCacheFile, this.cookieJar.toJSON());
  }

  check200(url) {
    return this.axios
      .get(url, {
        validateStatus: () => true,
        maxRedirects: 0,
      })
      .then(({ status }) => status === 200);
  }

  async isLoggedin() {
    return (
      (await retryPromise(() => this.check200('https://ka.sina.com.cn/html5/mybox'))) &&
      (this.appCheckinConfig ? true : await retryPromise(() => this.check200('https://weibo.com/aj/account/watermark')))
    );
  }

  login() {
    return retryPromise(
      () => this._login().then(() => true),
      e => _warn('???????????????????????????', e.toString()),
    ).catch(e => {
      _err('????????????', e.toString());
      return false;
    });
  }

  async _login() {
    if (await this.isLoggedin()) {
      _log('Cookie ???????????????????????????');
      return;
    }
    _log('?????????');

    const jumpUrl = await retryPromise(() =>
      this.axios
        .get('https://login.sina.com.cn/sso/login.php', {
          params: {
            url: 'https://weibo.com/ysmihoyo',
            gateway: 1,
            useticket: 1,
            service: 'miniblog',
            entry: 'miniblog',
            returntype: 'META',
            _client_version: '0.6.36',
            _rand: Date.now() / 1000,
          },
        })
        .then(({ data }) => {
          const search = /location\.replace\("(.+?)"\);/.exec(data);
          return search && search[1];
        }),
    );

    if (!jumpUrl) throw new Error('????????????[0]');

    const loginUrl = await retryPromise(() =>
      this.axios.get(jumpUrl).then(({ data }) => {
        const search = /setCrossDomainUrlList\((.+?)\);/.exec(data);
        const json = search && search[1];
        try {
          return JSON.parse(json).arrURL[0];
        } catch (error) {
          _err(error);
        }
      }),
    );

    if (!loginUrl) throw new Error('????????????[1]');

    if (!this.appCheckinConfig) {
      await retryPromise(() =>
        this.axios.get(loginUrl, {
          params: {
            callback: 'sinaSSOController.doCrossDomainCallBack',
            scriptId: 'ssoscript0',
            client: 'ssologin.js(v1.4.2)',
          },
        }),
      );
    }

    if (!(await this.isLoggedin())) throw new Error('????????????[2]');
    _log('????????????');

    this.saveCookieToCache();
  }

  checkin() {
    return this.appCheckinConfig ? this.checkinV2() : this.checkinV1();
  }

  checkinV1() {
    _log('????????????????????? API ??????');
    return retryPromise(
      () =>
        this.proxyAxios
          .get('https://weibo.com/p/aj/general/button', {
            params: {
              api: 'http://i.huati.weibo.com/aj/super/checkin',
              id: CONTAINER_ID,
            },
          })
          .then(async ({ data }) => {
            switch (data.code) {
              case '100000':
                _log('????????????');
                return true;
              case 382004:
                _warn('????????????????????????');
                return false;
              default:
                global.failed = true;
                _err('????????????:', typeof data === 'string' ? data : JSON.stringify(_.pick(data, ['code', 'msg'])));
                return false;
            }
          }),
      e => _warn('?????????????????????????????????', e.toString()),
    ).catch(e => {
      global.failed = true;
      _err('??????????????????', e.toString());
    });
  }

  checkinV2() {
    _log('????????????????????? API ??????');
    return retryPromise(
      () =>
        this.axios.get('https://api.weibo.cn/2/page/button', this.appCheckinConfig).then(async ({ data }) => {
          switch (data.result) {
            case 1:
              _log('????????????');
              return true;
            default:
              global.failed = true;
              _err('????????????:', typeof data === 'string' ? data : JSON.stringify(_.pick(data, ['result', 'msg'])));
              return false;
          }
        }),
      e => _warn('?????????????????????????????????', e.toString()),
    ).catch(e => {
      global.failed = true;
      _err('??????????????????', e.toString());
    });
  }

  async getMyGiftBox() {
    const { data } = await retryPromise(() => this.axios.get('https://ka.sina.com.cn/html5/mybox'));
    const $ = load(data);
    return Array.from($('.gift-box .deleBtn')).map(el => $(el).attr('data-itemid'));
  }

  getGiftCode({ id, name }, retry = 9) {
    return this.axios
      .get('https://ka.sina.com.cn/innerapi/draw', {
        params: {
          gid: '10725',
          itemId: id,
          channel: 'wblink',
        },
        headers: {
          referer: `https://ka.sina.com.cn/html5/gift/${id}?${stringify({
            channel: 'wblink',
            luicode: '10000011',
            lfid: `${CONTAINER_ID}_-_feed`,
          })}`,
        },
      })
      .then(async ({ data: { msg, data } }) => {
        if (data && data.kahao) {
          _log(`???${name}???????????????`);
          return data.kahao;
        }
        _err(`???${name}??????????????????${String(msg).replace(/?????????.+????/, '')}`);
        if (retry <= 0) {
          global.failed = true;
          _err('?????????????????????????????????');
          return;
        }
        if (msg.includes('????????????')) {
          _log('??????5????????????');
          await sleep(5000);
          return this.getGiftCode({ id, name }, retry - 1);
        }
      })
      .catch(e => {
        global.failed = true;
        _err('????????????????????????', e.toString());
      });
  }

  static async getGiftList() {
    const { data } = await retryPromise(() =>
      axios.get(`https://m.weibo.cn/api/container/getIndex`, {
        timeout: 10000,
        params: {
          containerid: `${CONTAINER_ID}_-_feed`,
          luicode: '10000011',
          lfid: '100103type=1&q=??????',
        },
      }),
    );

    const list = (() => {
      for (const { card_group } of data.data.cards) {
        if (!card_group) continue;
        for (const { group } of card_group) {
          if (!group) continue;
          const tmp = group.filter(({ scheme }) => String(scheme).startsWith('https://ka.sina.com.cn'));
          if (tmp.length) return tmp;
        }
      }
      return [];
    })();

    return list.map(({ title_sub, scheme }) => ({
      id: String(/(?<=gift\/)\d+/.exec(scheme)),
      name: title_sub,
    }));
  }
};
