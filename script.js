class Messages {
    static #getNextId() {
        const idString = localStorage.getItem('messages_last_id')
        const lastId = (idString === null) ? 0 : parseInt(idString)

        localStorage.setItem('messages_last_id', (lastId + 1).toString())

        return lastId
    }

    static list() {
        const messagesString = localStorage.getItem('messages')

        if (messagesString === null) return []
        return JSON.parse(messagesString)
    }

    static update(messages) {
        localStorage.setItem('messages', JSON.stringify(messages))
    }

    static add({ content, role }) {
        const message = { id: Messages.#getNextId(), content, role }

        let messages = Messages.list()
        messages.push(message)
        Messages.update(messages)

        return message
    }

    static remove(id, drop=false) {
        let messages = Messages.list()

        const index = messages.findIndex(item => item.id == id)
        if (index == -1) return

        if(drop) messages.splice(index)
        else messages.splice(index, 1)
        Messages.update(messages)
    }
}

class Profile {
    static #init() {
        const profile = {
            base_url: '',
            api_key: '',
            model: 'gpt-4o',
            model_override: '',
            max_messages: 20,
            max_tokens: 1024,
            jailbreak: '',
            main: ''
        }

        localStorage.setItem('profile', JSON.stringify(profile))
    }

    static get() {
        let profileString = localStorage.getItem('profile')

        if (profileString === null) {
            Profile.#init()
            profileString = localStorage.getItem('profile')
        }

        return JSON.parse(profileString)
    }

    static update(updated) {
        let profile = Profile.get()

        profile = {
            ...profile,
            ...updated
        }

        localStorage.setItem('profile', JSON.stringify(profile))
    }
}

class Completions {
    static async * send() {
        const profile = Profile.get()

        let messages = Messages.list()
        if (!!profile.main) messages.unshift({ role: 'system', content: profile.main })
        if (!!profile.jailbreak) messages.push({ role: 'system', content: profile.jailbreak })

        messages = messages.slice(-profile.max_messages)

        console.log(messages)

        const request = {
            messages,
            model: !profile.model_override ? profile.model : profile.model_override,
            max_tokens: profile.max_tokens,
            stream: true
        }

        const url = profile.base_url + 'chat/completions'
        const headers = {
            "Authorization": `Bearer ${profile.api_key}`,
            "Content-Type": "application/json"
        }

        // TODO: throwing errors to messages
        let response = undefined
        try {
            response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(request) })
            console.log("Status: " + response.status)
            if ( !(response.status == 200 || response.status == 203) ) throw 'err'
        } catch {
            console.log("Connection error")
            return undefined
        }

        var reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = ''

        yield reader

        while (true) {
            const { value, done } = await reader.read()
            if (done) break

            buffer += value
            let lines = buffer.split('\n\n')

            buffer = lines.pop()

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].replace('data: ', '')

                if (!line || line == '[DONE]') break
                else {
                    try {
                        const data = JSON.parse(line)
                        const ch = data?.choices[0]?.delta?.content

                        if (!!ch) yield ch
                    } catch { }
                }
            }
        }
    }

    static async models(){
        const profile = Profile.get()

        const url = profile.base_url + 'models'
        const headers = {
            "Authorization": `Bearer ${profile.api_key}`,
        }

        const response = await fetch(url, {headers})
        const data = (await response.json()).data
        
        return data.map( item => item.id )
    }
}