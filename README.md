# genshin-mys-checkin

- 每天早上 7:00 ~ 7:10 随机时间签到
- 部分失败不会使整体流程终止，并且你会收到一封来自 GitHub 的 Actions 失败提醒邮件
- 运行前会自动同步主仓库，并使用主仓库文件解决冲突，如有自定义需求请自行修改 workflows

## 【重要】关于自动同步上游

主仓库可能会修改 workflow 配置文件，而 GitHub Actions 默认提供的 token 只有 repo 权限而没有 workflow 权限，因此会同步失败

有两种解决方案：

1. [点击此处](https://github.com/settings/tokens/new?description=genshin-mys-checkin&scopes=workflow)打开 personal token 生成页，默认会帮你填好 note 和自动勾选 workflow scope，生成然后写入 `ACCESS_TOKEN` secrets  
   ※ 只对新 fork 的仓库有效，如果你在看到本说明前已经出现问题，请参考下一条方案
2. 如果你不愿意或不放心使用 token，可以自行同步主仓库，现在 GitHub 网页端添加了一个“Fetch upstream”功能，你可以直接在网页端完成同步

项目建立初期修修补补可能有时会改到 workflow，稳定后应该就不会怎么动了

## 米游社

- 支持多帐号及多角色
- 如果角色信息请求失败，提示登陆失效，请在米游社网页登出，然后重新登录，更新 cookie

### Secrets

#### `COOKIE`  

米游社网页版 cookie，如需多帐号签到，以 `#` 隔开

### 参考

- [y1ndan/genshin-impact-helper](https://github.com/y1ndan/genshin-impact-helper)
- [yinghualuowu/GenshinDailyHelper](https://github.com/yinghualuowu/GenshinDailyHelper)

## 微博超话（试作型v2）

- 自动签到、领取礼包，并可以通过 webhook 发送兑换码，支持多帐号
- 有一定使用门槛（懂的都懂，不懂的我也没办法）
- 可能无法通过 GitHub Actions 使用

### 准备

你需要构造这样一个 JSON，如果要多账号的话你应该懂怎么做

```json
[
  {
    "alc": "",
    "webhook": "",
    "proxy": ""
  }
]
```

#### `alc`

1. PC 登录[新浪网](https://www.sina.com.cn/)
2. 进入[这个页面](https://login.sina.com.cn/sso/test)，会 404，不用管
3. F12 开发者工具 - Application - Cookies，将 `ALC` 的值填入即可

#### `webhook`（可选）

当有礼包领取成功时，会将兑换码发至该 webhook，目前仅使用 GET 方式调用，可用以下占位符：

- `{{id}}` - 礼包ID
- `{{name}}` - 礼包名
- `{{code}}` - 兑换码
- `{{index}}` - 账户序号，从 0 开始

※ 你可以使用 [Server酱](http://sc.ftqq.com/3.version) 或 [IFTTT](https://ifttt.com/) 之类的工具推送至微信或 Telegram 等

#### `proxy`（可选）

签到使用的代理，支持 http / https / socks

### 使用

因为异地签到会出现“行为存在异常”问题，因此只建议两种使用方式：

1. 在常用地使用，如何自动化请自行解决
2. 搞一个常用地的代理，配置 `proxy`，这样可以在 GitHub Actions 中成功签到，你可以在本地配好先试试

#### 在本地使用

将上面构造好的 JSON 文件命名为 `wbconfig.json`，置于项目根目录，然后 `npm start`

#### 在 GitHub Actions 上使用

将上面构造好的 JSON 进行 base64 编码，设置为 `WB_CONFIG` secrets

### 参考

- [happy888888/WeiboTask](https://github.com/happy888888/WeiboTask)
