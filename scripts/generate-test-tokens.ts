
import { generateUserToken, generateAccessToken, generateHostSecret } from '../electron/crypto-utils'

const hostSecret = 'test-host-secret'
const hardwareId = 'test-hardware-id'
const userId = 'test-user-id'
const userToken = generateUserToken(hardwareId)
const accessToken = generateAccessToken(userToken, hostSecret, ['READ_ONLY'], userId)

import fs from 'fs'

const tokens = {
    hostSecret,
    userToken,
    accessToken,
    hardwareId
}

fs.writeFileSync('tokens.json', JSON.stringify(tokens, null, 2))
console.log('Tokens written to tokens.json')
