#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface WMServer : NSObject
- (nullable NSString *)startWithValidator:(BOOL (^)(NSString *, NSString *, NSString *, BOOL))validator
                                 handler:(void (^)(NSString *, NSData *, void (^)(NSInteger, NSDictionary *)))handler;
- (void)stop;
@end
NS_ASSUME_NONNULL_END
