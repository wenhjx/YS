const { _log, _warn, _err } = require('../utils/log');
const _ = require('lodash');
const { get, post } = require('axios').default;
const dvid = require('./dvid');
const ds = require('./ds');
const retryPromise = require('../utils/retryPromise');

const act_id = 'e202009291139501';

const maskUid = uid => uid.substr(-3).padStart(uid.length, '*');

module.exports = class MysClient {
  constructor(cookie) {
    this.headers = {
      'x-rpc-device_id': dvid(),
      'x-rpc-client_type': '5',
      'x-rpc-app_version': '2.3.0',
      'user-agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) miHoYoBBS/2.3.0',
      origin: 'https://webstatic.mihoyo.com',
      referer: `https://webstatic.mihoyo.com/bbs/event/signin-ys/index.html?bbs_auth_required=true&act_id=${act_id}&utm_source=bbs&utm_medium=mys&utm_campaign=icon`,
      cookie,
    };
  }

  getRoles() {
    return retryPromise(
      () =>
        get('https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_cn', {
          headers: this.headers,
        }).then(({ data }) => {
          const list = _.get(data, 'data.list');
          if (!list) {
            global.failed = true;
            _err(JSON.stringify(data));
            return;
          }
          return list;
        }),
      e => {
        _warn('角色信息请求失败，进行重试', e.toString());
      },
    ).catch(e => {
      global.failed = true;
      _err('角色信息请求失败', e.toString());
      return [];
    });
  }

  checkin({ region, game_uid: uid, region_name }) {
    return retryPromise(
      () =>
        post(
          'https://api-takumi.mihoyo.com/event/bbs_sign_reward/sign',
          { act_id, region, uid },
          { headers: { ...this.headers, ds: ds() } },
        ).then(({ data }) => {
          (() => {
            switch (data.retcode) {
              case 0:
                return _log;
              case -5003:
                return _warn;
              default:
                global.failed = true;
                return _err;
            }
          })()(maskUid(uid), region_name, JSON.stringify(data));
        }),
      e => {
        _warn('签到请求失败，进行重试', e.toString());
      },
    ).catch(e => {
      global.failed = true;
      _err(maskUid(uid), region_name, '签到请求失败', e.toString());
    });
  }
};
