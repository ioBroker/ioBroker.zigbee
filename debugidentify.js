'use strict';

class debugIdentifier {
    ReportIdentifier() {
      return "Asgothian Debug " + ReportVersion();
    }
    ReportVersion()
    {
      return "1.3.1.a";
    }
}

module.exports = debugIdentifier;
