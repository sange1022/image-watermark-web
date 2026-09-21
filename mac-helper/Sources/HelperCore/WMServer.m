#import "WMServer.h"
#import "GCDWebServer.h"
#import "GCDWebServerDataRequest.h"
#import "GCDWebServerDataResponse.h"

static NSString *Header(NSDictionary *headers, NSString *name) {
    for (NSString *key in headers) if ([key caseInsensitiveCompare:name] == NSOrderedSame) return headers[key];
    return @"";
}

@implementation WMServer {
    GCDWebServer *_server;
}
- (NSString *)startWithValidator:(BOOL (^)(NSString *, NSString *, NSString *, BOOL))validator
                        handler:(void (^)(NSString *, NSData *, void (^)(NSInteger, NSDictionary *)))handler {
    _server = [[GCDWebServer alloc] init];
    [GCDWebServer setLogLevel:4];
    [_server addHandlerWithMatchBlock:^GCDWebServerRequest *(NSString *method, NSURL *url, NSDictionary *headers, NSString *path, NSDictionary *query) {
        BOOL preflight = [method isEqualToString:@"OPTIONS"];
        BOOL known = [@[@"/status", @"/import", @"/open-photos"] containsObject:path];
        if (!known || !validator(Header(headers, @"Host"), Header(headers, @"Origin"), Header(headers, @"Authorization"), preflight)) return nil;
        if (preflight) return [[GCDWebServerRequest alloc] initWithMethod:method url:url headers:headers path:path query:query];
        if (![method isEqualToString:@"POST"]) return nil;
        NSString *length = Header(headers, @"Content-Length");
        NSCharacterSet *nonDigits = [[NSCharacterSet decimalDigitCharacterSet] invertedSet];
        if (!length.length || [length rangeOfCharacterFromSet:nonDigits].location != NSNotFound || length.longLongValue > 64 * 1024 * 1024 ||
            Header(headers, @"Transfer-Encoding").length || Header(headers, @"Content-Encoding").length ||
            ![Header(headers, @"Content-Type") isEqualToString:@"application/json"]) return nil;
        return [[GCDWebServerDataRequest alloc] initWithMethod:method url:url headers:headers path:path query:query];
    } asyncProcessBlock:^(GCDWebServerRequest *request, GCDWebServerCompletionBlock completion) {
        NSString *origin = Header(request.headers, @"Origin");
        void (^reply)(NSInteger, NSDictionary *) = ^(NSInteger code, NSDictionary *body) {
            GCDWebServerDataResponse *response = [GCDWebServerDataResponse responseWithJSONObject:body];
            response.statusCode = code;
            [response setValue:origin forAdditionalHeader:@"Access-Control-Allow-Origin"];
            [response setValue:@"POST, OPTIONS" forAdditionalHeader:@"Access-Control-Allow-Methods"];
            [response setValue:@"Content-Type, Authorization" forAdditionalHeader:@"Access-Control-Allow-Headers"];
            [response setValue:@"true" forAdditionalHeader:@"Access-Control-Allow-Private-Network"];
            [response setValue:@"no-store" forAdditionalHeader:@"Cache-Control"];
            [response setValue:@"Origin" forAdditionalHeader:@"Vary"];
            completion(response);
        };
        if ([request.method isEqualToString:@"OPTIONS"]) { reply(200, @{}); return; }
        handler(request.path, [(GCDWebServerDataRequest *)request data] ?: [NSData data], reply);
    }];
    NSError *error;
    BOOL started = [_server startWithOptions:@{GCDWebServerOption_Port: @47831, GCDWebServerOption_BindToLocalhost: @YES,
        GCDWebServerOption_ServerName: @"WatermarkPhotoHelper"} error:&error];
    return started ? nil : error.localizedDescription;
}
- (void)stop { [_server stop]; }
@end
