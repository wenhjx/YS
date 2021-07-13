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
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.96 Safari/537.36',
  },
  withCredentials: true,
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = class WbClient {
  constructor({ alc, proxy, aid, from, gsid, s }) {
    if (gsid && s) {
      this.appCheckinConfig = {
        params: {
          aid,
          from,
          gsid,
          s,
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
    _log('读取 cookie 缓存');
    try {
      return CookieJar.fromJSON(Fs.readJsonSync(this.cookieCacheFile));
    } catch (error) {
      return new CookieJar();
    }
  }

  saveCookieToCache() {
    _log('保存 cookie 至缓存');
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
      e => {
        _warn('登录失败，进行重试', e.toString());
      },
    ).catch(e => {
      _err('登录失败', e.toString());
      return false;
    });
  }

  async _login() {
    if (await this.isLoggedin()) {
      _log('Cookie 有效，无需重新登陆');
      return;
    }
    _log('登录中');

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

    if (!jumpUrl) throw new Error('登录失败[0]');

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

    if (!loginUrl) throw new Error('登录失败[1]');

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

    if (!(await this.isLoggedin())) throw new Error('登录失败[2]');
    _log('登录成功');

    this.saveCookieToCache();
  }

  checkin() {
    return this.appCheckinConfig ? this.checkinV2() : this.checkinV1();
  }

  checkinV1() {
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
                _log('签到成功');
                return true;
              case 382004:
                _warn('今天已经签到过了');
                return false;
              default:
                global.failed = true;
                _err('签到失败:', typeof data === 'string' ? data : JSON.stringify(_.pick(data, ['code', 'msg'])));
                return false;
            }
          }),
      e => {
        _warn('签到请求失败，进行重试', e.toString());
      },
      9,
    ).catch(e => {
      global.failed = true;
      _err('签到请求失败', e.toString());
    });
  }

  checkinV2() {
    return retryPromise(
      () =>
        this.axios.get('https://api.weibo.cn/2/page/button', this.appCheckinConfig).then(async ({ data }) => {
          switch (data.result) {
            case 1:
              _log('签到成功');
              return true;
            default:
              global.failed = true;
              _err('签到失败:', typeof data === 'string' ? data : JSON.stringify(_.pick(data, ['result', 'msg'])));
              return false;
          }
        }),
      e => {
        _warn('签到请求失败，进行重试', e.toString());
      },
      9,
    ).catch(e => {
      global.failed = true;
      _err('签到请求失败', e.toString());
    });
  }

  async getMyGiftBox() {
    const { data } = await this.axios.get('https://ka.sina.com.cn/html5/mybox');
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
          _log(`「${name}」领取成功`);
          return data.kahao;
        }
        _err(`「${name}」领取失败：${String(msg).replace(/亲爱的.+?，/, '')}`);
        if (retry <= 0) {
          global.failed = true;
          _err('失败次数过多，放弃签到');
          return;
        }
        if (msg.includes('领卡拥挤')) {
          _log('将在5秒后重试');
          await sleep(5000);
          return this.getGiftCode({ id, name }, retry - 1);
        }
      })
      .catch(e => {
        global.failed = true;
        _err('礼包领取请求失败', e.toString());
      });
  }

  static async getGiftList() {
    const { data } = await axios.get(`https://m.weibo.cn/api/container/getIndex`, {
      params: {
        containerid: `${CONTAINER_ID}_-_feed`,
        luicode: '10000011',
        lfid: '100103type=1&q=原神',
      },
    });

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
