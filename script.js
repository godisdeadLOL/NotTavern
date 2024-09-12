class Messages {
    static #getNextId() {
        const idString = localStorage.getItem('messages_last_id')
        const lastId = (idString === null) ? 0 : parseInt(idString)

        localStorage.setItem('messages_last_id', (lastId + 1).toString())

        return lastId
    }

    static list(notes=false) {
        const messagesString = localStorage.getItem('messages')

        if (messagesString === null) return []
        let messages = JSON.parse(messagesString)

        if(notes) messages = messages.filter(msg => !!msg.pinned)
        return messages
    }

    static updateAll(messages) {
        localStorage.setItem('messages', JSON.stringify(messages))
    }

    static add(message) {
        const added = { id: Messages.#getNextId(), pinned: false, ...message }

        let messages = Messages.list()
        messages.push(added)
        Messages.updateAll(messages)

        return added
    }

    static update(id, message) {
        let messages = Messages.list()

        const index = messages.findIndex(item => item.id == id)
        if (index == -1) return

        messages[index] = { ...messages[index], ...message }
        Messages.updateAll(messages)
    }

    static remove(id, drop=false) {
        let messages = Messages.list()

        const index = messages.findIndex(item => item.id == id)
        if (index == -1) return

        if(drop) messages.splice(index)
        else messages.splice(index, 1)
        Messages.updateAll(messages)
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

        // Messages
        let messages = Messages.list()
        
        // messages.unshift({ role: 'system', content: '### Chat history'  })

        if (!!profile.main) messages.unshift({ role: 'system', content: profile.main })
        if (!!profile.jailbreak) messages.push({ role: 'system', content: profile.jailbreak })

        messages = messages.slice(-profile.max_messages)

        // Notes
        let notes = Messages.list(true)
        
        if (notes.length > 0) {
            notes.forEach(msg => msg.role = 'system')
            messages.unshift(...notes)
            messages.unshift({ role: 'system', content: '### Notes (pinned messages containing important information)' })
        }

        const request = {
            messages,
            model: !profile.model_override ? profile.model : profile.model_override,
            max_tokens: profile.max_tokens,
            stream: true
        }

        console.log(request)

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