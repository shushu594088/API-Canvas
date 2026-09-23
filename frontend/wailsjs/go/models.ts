export namespace main {
	
	export class GenerationJob {
	    id: string;
	    profileId: string;
	    prompt: string;
	    negativePrompt?: string;
	    model: string;
	    size: string;
	    quality: string;
	    format: string;
	    status: string;
	    progress: number;
	    errorCode?: string;
	    errorMessage?: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new GenerationJob(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.profileId = source["profileId"];
	        this.prompt = source["prompt"];
	        this.negativePrompt = source["negativePrompt"];
	        this.model = source["model"];
	        this.size = source["size"];
	        this.quality = source["quality"];
	        this.format = source["format"];
	        this.status = source["status"];
	        this.progress = source["progress"];
	        this.errorCode = source["errorCode"];
	        this.errorMessage = source["errorMessage"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class GenerationRequest {
	    prompt: string;
	    negativePrompt?: string;
	    model: string;
	    size: string;
	    quality: string;
	    format: string;
	    profileId: string;
	
	    static createFrom(source: any = {}) {
	        return new GenerationRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.prompt = source["prompt"];
	        this.negativePrompt = source["negativePrompt"];
	        this.model = source["model"];
	        this.size = source["size"];
	        this.quality = source["quality"];
	        this.format = source["format"];
	        this.profileId = source["profileId"];
	    }
	}
	export class HistoryItem {
	    jobId: string;
	    prompt: string;
	    negativePrompt?: string;
	    model: string;
	    size: string;
	    quality: string;
	    format: string;
	    createdAt: number;
	    thumbnailUrl: string;
	    assetId: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.jobId = source["jobId"];
	        this.prompt = source["prompt"];
	        this.negativePrompt = source["negativePrompt"];
	        this.model = source["model"];
	        this.size = source["size"];
	        this.quality = source["quality"];
	        this.format = source["format"];
	        this.createdAt = source["createdAt"];
	        this.thumbnailUrl = source["thumbnailUrl"];
	        this.assetId = source["assetId"];
	    }
	}
	export class HistoryPage {
	    items: HistoryItem[];
	    nextCursor?: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryPage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], HistoryItem);
	        this.nextCursor = source["nextCursor"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HistoryQuery {
	    cursor: string;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new HistoryQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.limit = source["limit"];
	    }
	}
	export class Profile {
	    id: string;
	    name: string;
	    protocol: string;
	    baseUrl: string;
	    apiKeyMasked: string;
	    hasKey: boolean;
	    model: string;
	    textModel?: string;
	    models?: string[];
	    strategy: string;
	    isDefault: boolean;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.protocol = source["protocol"];
	        this.baseUrl = source["baseUrl"];
	        this.apiKeyMasked = source["apiKeyMasked"];
	        this.hasKey = source["hasKey"];
	        this.model = source["model"];
	        this.textModel = source["textModel"];
	        this.models = source["models"];
	        this.strategy = source["strategy"];
	        this.isDefault = source["isDefault"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class ProfileInput {
	    name: string;
	    protocol: string;
	    baseUrl: string;
	    apiKey: string;
	    model: string;
	    textModel?: string;
	    models?: string[];
	    strategy: string;
	
	    static createFrom(source: any = {}) {
	        return new ProfileInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.protocol = source["protocol"];
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.model = source["model"];
	        this.textModel = source["textModel"];
	        this.models = source["models"];
	        this.strategy = source["strategy"];
	    }
	}
	export class TestResult {
	    conclusion: string;
	    latencyMs?: number;
	
	    static createFrom(source: any = {}) {
	        return new TestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.conclusion = source["conclusion"];
	        this.latencyMs = source["latencyMs"];
	    }
	}

}

