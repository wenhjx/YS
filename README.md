# genshin-mys-checkin

- 每天早上 7:00 签到
- 部分失败不会使整体流程终止，并且你会收到一封来自 GitHub 的 Actions 失败提醒邮件
- 运行时会自动同步该上游仓库，并使用上游仓库文件解决冲突，如有自定义需求请自行修改 workflow

## 使用方法

> 旧版中配置 `COOKIE` 和 `WB_CONFIG` secrets 等使用方式依然支持，老用户不需要重新配置，如果要更新配置建议使用新配置方式

**在 GitHub Actions 中使用：**

1. Fork 本项目（顺便赏个 star 就更好了）
2. 前往 Actions 页面启用 GitHub Actions
3. 构造 json 配置文件，创建 [gist](https://gist.github.com/) 并获取源文件链接
   1. description 随便，filename 要以 `.json` 结尾，例如 `genshin-checkin-config.json`
   2. 填入配置文件内容
   3. 点击“Create secret gist”创建私有 gist
   4. 右击右上角“Raw”，复制链接地址，将这个链接最后的 `/raw/xxx/yyy.json` 部分中的 `xxx/` 删除，即变为 `/raw/yyy.json`，就得到我们要的源文件链接了
   5. 以后如果想要修改配置文件就直接修改这个 gist 即可
4. 将配置文件链接写入 `CONFIG_URL` secrets

> 签到脚本这类 GitHub Actions 使用方式实际上违反了 TOS，不排除今后某天本仓库突然爆炸的可能，且用且珍惜

**在本地使用：**

1. 安装 Node.js
2. Clone 本项目
3. `npm i`
4. 构造 json 配置文件，命名为 `config.json` 并置于项目根目录
5. `npm start`

### 配置文件

目前完整配置文件结构如下，并不是所有字段都是必填，请根据后续说明完善配置文件

```json
{
  "mys": [
    ""
  ],
  "weibo": [
    {
      "alc": "",
      "aid": "",
      "gsid": "",
      "s": "",
      "webhook": "",
      "proxy": ""
    }
  ]
}
```

### 自动同步上游

主仓库可能会修改 workflow 配置文件，而 GitHub Actions 默认提供的 token 只有 repo 权限而没有 workflow 权限，因此会同步失败

有两种解决方案：

1. [点击此处](https://github.com/settings/tokens/new?description=genshin-mys-checkin&scopes=workflow)打开 personal token 生成页，默认会帮你填好 note 和自动勾选 workflow scope，生成然后写入 `ACCESS_TOKEN` secrets  
2. 如果你不愿意或不放心使用 token，可以自行同步主仓库，现在 GitHub 网页端添加了一个“Fetch upstream”功能，你可以直接在网页端完成同步

项目建立初期修修补补可能有时会改到 workflow，稳定后应该就不会怎么动了

## 米游社

- 支持多帐号及多角色
- 如果角色信息请求失败，提示登陆失效，请在米游社网页登出，然后重新登录，更新 cookie

### 配置

往 `mys` 数组中填入你的米游社 cookie，每项一个帐号，例：

```json
{
  "mys": [
    "cookie1",
    "cookie2"
  ]
}
```

### 参考

- [y1ndan/genshinhelper](https://github.com/y1ndan/genshinhelper)
- [yinghualuowu/GenshinDailyHelper](https://github.com/yinghualuowu/GenshinDailyHelper)

## 微博超话

- 自动签到、领取礼包，并可以通过 webhook 发送兑换码，支持多帐号
- 有一定使用门槛（懂的都懂，不懂的我也没办法）

### 配置

```json
{
  "weibo": [
    {
      "alc": "",
      "aid": "",
      "gsid": "",
      "s": "",
      "webhook": "",
      "proxy": ""
    }
  ]
}
```

如果要多账号的话你应该懂怎么做

微博超话签到支持两种 API，微博网页版和微博国际版客户端

|                              |          网页版          |         国际版         |
| ---------------------------- | :----------------------: | :--------------------: |
| 必须配置项                   |          `alc`           | `alc` `aid` `gsid` `s` |
| 在 GitHub Actions 中异地签到 | 不可以，除非配置 `proxy` |          可以          |

#### `alc`

1. PC 登录[新浪网](https://www.sina.com.cn/)
2. 进入[这个页面](https://login.sina.com.cn/sso/test)，会 404，不用管
3. F12 开发者工具 - Application - Cookies，将 `ALC` 的值填入即可

#### `aid` `gsid` `s`（可选）

只有提供了这几项配置才会使用微博**国际版**客户端 API 进行签到

需要通过抓微博国际版客户端的包得到，我只能说懂的都懂

我个人习惯使用 [whistle](https://github.com/avwo/whistle)

#### `webhook`（可选）

当有礼包领取成功时，会将兑换码发至该 webhook，目前仅使用 GET 方式调用，可用以下占位符：

- `{{id}}` - 礼包ID
- `{{name}}` - 礼包名
- `{{code}}` - 兑换码
- `{{index}}` - 账户序号，从 0 开始

注意 URL 参数中除了上述占位符外的内容都应该进行 URL 编码

※ 你可以使用 [Server酱](http://sc.ftqq.com/3.version) 或 [IFTTT](https://ifttt.com/) 之类的工具推送至微信或 Telegram 等

#### `proxy`（可选）

签到使用的代理，支持 http / https / socks

只有使用微博**网页版** API 签到才会使用，可用于规避异地签到问题

### 参考

- [y1ndan/genshinhelper](https://github.com/y1ndan/genshinhelper)
- [happy888888/WeiboTask](https://github.com/happy888888/WeiboTask)
