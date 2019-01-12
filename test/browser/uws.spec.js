const { UniversalWebSocket } = require('../../client');
const { expect } = require('chai');
describe('Universal WS', function () {
    it('UWS Exists', function (done) {
        console.log(UniversalWebSocket);
        expect(UniversalWebSocket).to.exist;
        done();
    });
    it('UWS Construct', function (done) {
        const connection = new UniversalWebSocket('ws://localhost:3005');
        expect(connection).to.exist;
        done();
    });
    // it('fail', function (done) {
    //     expect(null).to.exist;
    //     done("blah");
    // });
});
